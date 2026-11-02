import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Input } from "mediabunny";
import { formatDay } from "@/lib/files-nav";
import type { MediaMeta } from "@/lib/media-meta";
import { dequantizePeaks, frameAt, spriteLayout, type SpriteLayout } from "@/lib/preview-math";
import type { R2Listing } from "@/lib/r2";
import {
  parsePeaksSidecar,
  parseStripSidecar,
  publicUrl,
  type ThumbKind,
  type ThumbSet,
} from "@/lib/thumbs";
import { fileKind, formatBytes } from "@/lib/utils";
import {
  fetchJson,
  fetchMeta,
  loadPreview,
  thumbUrl,
  type Meta,
} from "@/components/files/client";
import { KIND_COLOUR } from "@/components/files/kinds";
import { DownloadIcon, FileIcon, PauseIcon, PlayIcon } from "@/components/files/icons";
import { usePlayerValue } from "@/components/player/usePlayer";
import { formatClock } from "@/lib/clock";
import { dock, play, toggle as togglePlayback } from "@/lib/player";
import type { PlayerTrack } from "@/lib/player-state";

/**
 * A visitor's browser downloads the whole file to draw a waveform, so past
 * this it plays without one. The owner backfill has no such cap.
 */
const VISITOR_WAVEFORM_MAX_BYTES = 64 * 1024 * 1024;

type Supported = Extract<MediaMeta, { supported: true }> & { thumbs?: ThumbSet; uploaded?: number };

export type PreviewKind = "video" | "audio";

export function previewKind(name: string): PreviewKind | null {
  const kind = fileKind(name);
  return kind === "video" || kind === "audio" ? kind : null;
}

/** The first rejection that is not us tearing the panel down. */
function isTeardown(error: unknown): boolean {
  return error instanceof Error && error.name === "InputDisposedError";
}

/**
 * A ref that shows the site-wide player's element in its node while this
 * file is the one playing. A ref, not an effect: React runs a ref's cleanup
 * in the same commit that removes the node (whatever removes it: a switch to
 * Fallback, another file), and a media element out of the document at the
 * next stable state is paused.
 */
function useDock(fileKey: string, current: boolean) {
  return useCallback(
    (node: HTMLElement | null) => (node && current ? dock(node, fileKey) : undefined),
    [fileKey, current],
  );
}

/** What the player shows for a file: its title tag, else its name. */
function trackFor(key: string, url: string, meta: Supported, kind: PlayerTrack["kind"], poster?: string | null): PlayerTrack {
  return {
    key,
    url,
    title: meta.tags.title ?? key.split("/").pop() ?? key,
    ...(meta.tags.artist ? { artist: meta.tags.artist } : {}),
    kind,
    ...(poster ? { poster } : {}),
  };
}

/** Set by the open preview so the browser's space key can play and pause it. */
export type PlaybackControl = RefObject<(() => void) | null>;

type Props = {
  fileKey: string;
  kind: PreviewKind;
  size: number;
  bucketBase: string;
  control?: PlaybackControl;
};

export default function MediaPreview({ fileKey, kind, size, bucketBase, control }: Props) {
  const url = publicUrl(bucketBase, fileKey);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaFailed, setMetaFailed] = useState(false);
  // Bumped after a backfill, so the thumbs flags are read again.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setMetaFailed(false);
    fetchMeta(fileKey, revision > 0)
      .then((m) => live && setMeta(m))
      .catch(() => live && setMetaFailed(true));
    return () => {
      live = false;
    };
  }, [fileKey, revision]);

  const folder = fileKey.slice(0, fileKey.lastIndexOf("/") + 1);
  const name = fileKey.slice(folder.length);

  return (
    <div>
      {metaFailed ? (
        <Fallback url={url} name={name} size={size} message="Couldn't read this file's details just now." />
      ) : !meta ? (
        <div className="placeholder-block aspect-video w-full rounded-[5px]" />
      ) : !meta.supported ? (
        <Fallback url={url} name={name} size={size} message="No preview for this format." />
      ) : kind === "video" && meta.video ? (
        <VideoPreview fileKey={fileKey} url={url} base={bucketBase} meta={meta} size={size} control={control} />
      ) : (
        <AudioPreview
          fileKey={fileKey}
          url={url}
          base={bucketBase}
          meta={meta}
          size={size}
          control={control}
        />
      )}

      {meta?.supported && <Details meta={meta} size={size} />}
      {meta?.supported && <ThumbsNote kind={kind} thumbs={meta.thumbs} base={bucketBase} />}

      {bucketBase && (
        <Backfill folder={folder} base={bucketBase} onDone={() => setRevision((r) => r + 1)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Fallback({
  url,
  name,
  size,
  uploaded,
  message,
  meta,
  onRetry,
}: {
  url: string;
  name: string;
  size: number;
  uploaded?: number;
  message: string;
  meta?: Supported;
  /** Offered when playback failed, which may have been the network. */
  onRetry?: () => void;
}) {
  const codecs = [meta?.video?.codec, meta?.audio?.codec].filter(Boolean).join(" and ");
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
  const facts = [ext, formatBytes(size), uploaded ? formatDay(uploaded) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="fb-fallback">
      <span className="ic" style={{ color: KIND_COLOUR[fileKind(name)] }}>
        <FileIcon kind={fileKind(name)} size={30} />
      </span>
      <p>{message}</p>
      <small>{codecs ? `Encoded as ${codecs}.` : facts}</small>
      {onRetry && (
        <button type="button" onClick={onRetry} className="fb-btn">
          Try again
        </button>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" download className="fb-btn">
        <DownloadIcon size={14} />
        Download
      </a>
    </div>
  );
}

function Details({ meta, size }: { meta: Supported; size: number }) {
  const rows: [string, string][] = [];
  const { tags, video, audio } = meta;

  if (tags.title) rows.push(["Title", tags.title]);
  if (tags.artist) rows.push(["Artist", tags.artist]);
  if (tags.album) rows.push(["Album", tags.year ? `${tags.album} (${tags.year})` : tags.album]);
  else if (tags.year) rows.push(["Year", String(tags.year)]);
  if (meta.duration !== null) rows.push(["Duration", formatClock(meta.duration)]);
  if (video) {
    const parts = [video.codec ?? "unknown codec", `${video.width}x${video.height}`];
    if (video.frameRate) parts.push(`${Math.round(video.frameRate * 100) / 100} fps`);
    if (video.rotation) parts.push(`rotated ${video.rotation}°`);
    rows.push(["Video", parts.join(", ")]);
  }
  if (audio) {
    const channels =
      audio.channels === 1 ? "mono" : audio.channels === 2 ? "stereo" : `${audio.channels} channels`;
    rows.push([
      "Audio",
      `${audio.codec ?? "unknown codec"}, ${channels}, ${audio.sampleRate / 1000} kHz`,
    ]);
  }
  rows.push(["Container", meta.container]);
  rows.push(["Size", formatBytes(size)]);
  if (meta.uploaded) rows.push(["Uploaded", formatDay(meta.uploaded)]);

  return <DetailList rows={rows} />;
}

export function DetailList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="fb-dl">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Whether what is on screen came from stored thumbs or this browser's decoder. */
function ThumbsNote({ kind, thumbs, base }: { kind: PreviewKind; thumbs?: ThumbSet; base: string }) {
  if (!base) return null;
  const stored = kind === "video" ? thumbs?.poster && thumbs.strip : thumbs?.peaks;
  return (
    <p className={stored ? "fb-thumbs" : "fb-thumbs live"}>
      <i aria-hidden="true" />
      {stored
        ? kind === "video"
          ? "Poster and filmstrip stored in .thumbs/ for this upload"
          : "Waveform stored in .thumbs/ for this upload"
        : kind === "video"
          ? "No stored thumbs — frames decoded in this browser"
          : "No stored waveform — drawn in this browser"}
    </p>
  );
}

/* -------------------------------------------------------------------------- */

type StripView = { src: string; layout: SpriteLayout; timestamps: number[] };

/** Tallest the video stage gets, in CSS pixels. */
const STAGE_MAX_HEIGHT = 320;

/** Cells in the filmstrip under the stage, sampled from however many the sheet has. */
const STRIP_CELLS = 8;

type VideoState = "loading" | "ready" | "undecodable";

function spriteStyle(strip: StripView, frame: number): React.CSSProperties {
  const { columns, rows } = strip.layout;
  return {
    backgroundImage: `url("${strip.src}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns > 1 ? ((frame % columns) / (columns - 1)) * 100 : 0}% ${
      rows > 1 ? (Math.floor(frame / columns) / (rows - 1)) * 100 : 0
    }%`,
  };
}

function VideoPreview({
  fileKey,
  url,
  base,
  meta,
  size,
  control,
}: {
  fileKey: string;
  url: string;
  base: string;
  meta: Supported;
  size: number;
  control?: PlaybackControl;
}) {
  const [state, setState] = useState<VideoState>("loading");
  const [poster, setPoster] = useState<string | null>(null);
  const [strip, setStrip] = useState<StripView | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  // Not usePlayer(): the stage needs no clock, so it skips the 4 Hz timeupdates.
  const playing = usePlayerValue((snapshot) => snapshot.track?.key === fileKey);
  const failed = usePlayerValue((snapshot) => snapshot.track?.key === fileKey && snapshot.failed);
  const host = useDock(fileKey, playing);

  const video = meta.video;
  const aspect = video && video.width > 0 && video.height > 0 ? video.width / video.height : 16 / 9;
  // Full width for landscape; a portrait video is held to STAGE_MAX_HEIGHT.
  const stageStyle = {
    aspectRatio: String(aspect),
    width: `min(100%, ${Math.round(STAGE_MAX_HEIGHT * aspect)}px)`,
  };

  useEffect(() => {
    let live = true;
    let input: Input | null = null;

    (async () => {
      const posterUrl = meta.thumbs?.poster ? thumbUrl(base, fileKey, "poster.webp") : null;
      if (posterUrl) setPoster(posterUrl);

      let haveStrip = false;
      const stripUrl = meta.thumbs?.strip ? thumbUrl(base, fileKey, "strip.webp") : null;
      const sidecarUrl = meta.thumbs?.strip ? thumbUrl(base, fileKey, "strip.json") : null;
      if (stripUrl && sidecarUrl) {
        try {
          const sidecar = parseStripSidecar(await fetchJson(sidecarUrl));
          if (sidecar && live) {
            setStrip({
              src: stripUrl,
              layout: spriteLayout(
                sidecar.frames,
                { width: sidecar.tileWidth, height: sidecar.tileHeight },
                sidecar.columns,
              ),
              timestamps: sidecar.timestamps,
            });
            haveStrip = true;
          }
        } catch {
          // Unreadable sidecar: draw a strip here instead.
        }
      }

      // With both thumbs there is nothing to decode. Playback is the only
      // remaining check, and <video> reports that itself.
      if (posterUrl && haveStrip) {
        if (live) setState("ready");
        return;
      }

      const preview = await loadPreview();
      if (!live) return;
      input = preview.openInput(url);
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) {
        if (live) setState("undecodable");
        return;
      }

      const timing = await preview.trackTiming(track, meta.duration);
      if (!posterUrl) {
        const canvas = await preview.renderPoster(track, timing);
        if (!live) return;
        if (canvas) setPoster(preview.toDataUrl(canvas));
      }
      if (live) setState("ready");

      if (!haveStrip) {
        const generated = await preview.renderStrip(track, timing);
        if (!live) return;
        setStrip({
          src: preview.toDataUrl(generated.canvas),
          layout: generated.layout,
          timestamps: generated.timestamps,
        });
      }
    })().catch((error) => {
      if (!live || isTeardown(error)) return;
      console.error("[files] video preview failed", error);
      // A failed preview still leaves playback, which may well work.
      setState("ready");
    });

    return () => {
      live = false;
      input?.dispose();
    };
  }, [fileKey, url, base, meta]);

  const track = trackFor(fileKey, url, meta, "video", poster);
  const trackRef = useRef(track);
  trackRef.current = track;

  useEffect(() => {
    if (!control) return;
    control.current = () => (playing ? togglePlayback() : play(trackRef.current, 0));
    return () => {
      control.current = null;
    };
  }, [control, playing]);

  if (state === "undecodable" || failed) {
    return (
      <>
        {/* Still docked, so the box does not repeat the failure over this page. */}
        {failed && <span ref={host} hidden />}
        <Fallback
          url={url}
          name={fileKey.split("/").pop() ?? fileKey}
          size={size}
          meta={meta}
          message={
            state === "undecodable"
              ? "This browser can't decode this video."
              : "This browser can't play this video."
          }
          onRetry={failed ? () => play(trackRef.current, 0) : undefined}
        />
      </>
    );
  }

  const duration = meta.duration ?? 0;
  const cellCount = strip ? Math.min(STRIP_CELLS, strip.layout.frames) : STRIP_CELLS;
  const cells: number[] = Array.from({ length: cellCount }, (_, i) =>
    strip && cellCount > 1 ? Math.round((i * (strip.layout.frames - 1)) / (cellCount - 1)) : i,
  );

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!strip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setScrub(frameAt((event.clientX - rect.left) / rect.width, strip.layout.frames));
  };

  const scrubTime = strip && scrub !== null ? (strip.timestamps[scrub] ?? 0) : null;

  return (
    <>
      {playing ? (
        // The site-wide player's <video> is moved in here; see useDock.
        <div ref={host} className="fb-stage" style={stageStyle} />
      ) : (
        <button
          type="button"
          onClick={() => play(track, scrubTime ?? 0)}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setScrub(null)}
          aria-label="Play video"
          className="fb-stage"
          style={stageStyle}
        >
          {state === "loading" && !poster && <span className="ph placeholder-block" />}
          {poster && <img src={poster} alt="" />}
          {strip && scrub !== null && <span className="frame" style={spriteStyle(strip, scrub)} />}
          <span className="bigplay" aria-hidden="true">
            <PlayIcon size={18} />
          </span>
          {duration > 0 && (
            <span className="tc">
              {formatClock(scrubTime ?? 0)} / {formatClock(duration)}
            </span>
          )}
          {strip && scrub !== null && (
            <span className="scrub" style={{ width: `${((scrub + 1) / strip.layout.frames) * 100}%` }} />
          )}
          {state === "ready" && !strip && <span className="hint">building filmstrip…</span>}
        </button>
      )}

      <fieldset className={strip ? "fb-strip" : "fb-strip pending"}>
        <legend className="sr-only">Frame strip</legend>
        {cells.map((frame) => {
          const at = strip?.timestamps[frame] ?? 0;
          return (
            <button
              key={frame}
              type="button"
              disabled={!strip}
              tabIndex={strip ? 0 : -1}
              aria-label={strip ? `Play from ${formatClock(at)}` : "Frame not drawn yet"}
              title={strip ? formatClock(at) : undefined}
              className={scrub === frame ? "on" : undefined}
              style={strip ? spriteStyle(strip, frame) : undefined}
              onClick={() => strip && play(track, at)}
            />
          );
        })}
      </fieldset>
    </>
  );
}

/* -------------------------------------------------------------------------- */

type AudioState = "loading" | "ready" | "undecodable";

function AudioPreview({
  fileKey,
  url,
  base,
  meta,
  size,
  control,
}: {
  fileKey: string;
  url: string;
  base: string;
  meta: Supported;
  size: number;
  control?: PlaybackControl;
}) {
  const [state, setState] = useState<AudioState>("loading");
  const [cover, setCover] = useState<ImageBitmap | null>(null);
  const [peaks, setPeaks] = useState<{ values: Float32Array; done: number } | null>(null);
  const [skipped, setSkipped] = useState(false);
  // Selected, so another file's playback does not re-render this one.
  const current = usePlayerValue((snapshot) => snapshot.track?.key === fileKey);
  const position = usePlayerValue((snapshot) => (snapshot.track?.key === fileKey ? snapshot.time : 0));
  const paused = usePlayerValue((snapshot) => (snapshot.track?.key === fileKey ? snapshot.paused : true));
  const failed = usePlayerValue((snapshot) => snapshot.track?.key === fileKey && snapshot.failed);
  const host = useDock(fileKey, current);

  useEffect(() => {
    let live = true;
    let input: Input | null = null;
    setSkipped(false);

    (async () => {
      let havePeaks = false;
      const peaksUrl = meta.thumbs?.peaks ? thumbUrl(base, fileKey, "peaks.json") : null;
      if (peaksUrl) {
        try {
          const sidecar = parsePeaksSidecar(await fetchJson(peaksUrl));
          if (sidecar && live) {
            setPeaks({ values: dequantizePeaks(sidecar.peaks), done: 1 });
            havePeaks = true;
          }
        } catch {
          // Draw it here instead.
        }
      }

      const wantCover = meta.tags.coverArt;
      const tooLarge = !havePeaks && size > VISITOR_WAVEFORM_MAX_BYTES;
      if (tooLarge) setSkipped(true);
      if ((havePeaks || tooLarge) && !wantCover) {
        if (live) setState("ready");
        return;
      }

      const preview = await loadPreview();
      if (!live) return;
      input = preview.openInput(url);

      if (wantCover) {
        const bitmap = await preview.coverArt(input).catch(() => null);
        if (!live) {
          bitmap?.close();
          return;
        }
        setCover(bitmap);
      }
      if (havePeaks || tooLarge) {
        setState("ready");
        return;
      }

      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) {
        if (live) setState("undecodable");
        return;
      }
      if (live) setState("ready");

      const timing = await preview.trackTiming(track, meta.duration);
      await preview.computePeaks(track, timing, (values, done) => {
        // A copy: the generator keeps writing into its own array.
        if (live) setPeaks({ values: values.slice(), done });
      });
    })().catch((error) => {
      if (!live || isTeardown(error)) return;
      console.error("[files] audio preview failed", error);
      setState("ready");
    });

    return () => {
      live = false;
      input?.dispose();
    };
  }, [fileKey, url, base, meta, size]);

  // ImageBitmaps hold decoded pixels until closed.
  useEffect(() => () => cover?.close(), [cover]);

  const track = trackFor(fileKey, url, meta, "audio");
  const trackRef = useRef(track);
  trackRef.current = track;

  const toggle = useCallback(() => {
    if (current) togglePlayback();
    else play(trackRef.current, 0);
  }, [current]);

  useEffect(() => {
    if (!control) return;
    control.current = toggle;
    return () => {
      control.current = null;
    };
  }, [control, toggle]);

  const duration = meta.duration ?? 0;
  const seek = useCallback(
    (fraction: number) => {
      if (duration > 0) play(trackRef.current, fraction * duration);
    },
    [duration],
  );

  if (state === "undecodable" || failed) {
    return (
      <>
        {/* Still docked, so the box does not repeat the failure over this page. */}
        {failed && <span ref={host} hidden />}
        <Fallback
          url={url}
          name={fileKey.split("/").pop() ?? fileKey}
          size={size}
          meta={meta}
          message={
            state === "undecodable"
              ? "This browser can't decode this audio."
              : "This browser can't play this audio."
          }
          onRetry={failed ? () => play(trackRef.current, 0) : undefined}
        />
      </>
    );
  }

  return (
    <div className={meta.tags.coverArt ? "fb-aud" : "fb-aud nocover"}>
      {meta.tags.coverArt && (
        <div className="cover">
          {cover ? <Cover bitmap={cover} /> : <span className="placeholder-block block h-full w-full" />}
        </div>
      )}
      <div className="min-w-0">
        {peaks ? (
          <Waveform
            peaks={peaks.values}
            done={peaks.done}
            progress={duration > 0 ? position / duration : 0}
            onSeek={seek}
          />
        ) : skipped ? (
          <p className="fb-toobig">
            Too large to draw a waveform in the browser ({formatBytes(size)}). Playback still streams.
          </p>
        ) : (
          <div className="placeholder-block h-16 w-full rounded-[5px]" />
        )}
        <div className="fb-ctl">
          <button type="button" onClick={toggle} aria-label={paused ? "Play" : "Pause"}>
            {paused ? (
              <PlayIcon size={14} />
            ) : (
              <PauseIcon size={14} />
            )}
          </button>
          {!peaks && duration > 0 ? (
            <input
              type="range"
              min={0}
              max={duration}
              step="any"
              value={position}
              aria-label="Seek"
              onChange={(e) => seek(Number(e.currentTarget.value) / duration)}
            />
          ) : null}
          <span>
            {formatClock(position)} / {formatClock(duration)}
          </span>
        </div>
        {/* Holds the site-wide player's element while this file plays; see useDock. */}
        <span ref={host} hidden />
      </div>
    </div>
  );
}

function Cover({ bitmap }: { bitmap: ImageBitmap }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.width = bitmap.width;
    element.height = bitmap.height;
    element.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={canvas} role="img" aria-label="Cover art" />;
}

/** Bar width plus gap, in CSS pixels. */
const BAR_PITCH = 3;

export function Waveform({
  peaks,
  done,
  progress,
  onSeek,
  height = 64,
}: {
  peaks: Float32Array;
  /** How much of the file has been decoded so far, 0..1. */
  done: number;
  /** Playback position, 0..1. */
  progress: number;
  /** Absent for a decorative waveform, which is then not a slider. */
  onSeek?: (fraction: number) => void;
  height?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || width === 0) return;

    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(element);
    const played = styles.getPropertyValue("--color-brand-alt").trim() || "#9aa2dd";
    const rest = styles.getPropertyValue("--color-line").trim() || "#3f3d3a";

    // Scaled to the loudest peak, so a quiet recording still shows its shape.
    // The floor keeps near-silence from being blown up into noise.
    let loudest = 0;
    for (const p of peaks) if (p > loudest) loudest = p;
    const scale = 1 / Math.max(loudest, 0.05);

    const bars = Math.max(1, Math.floor(width / BAR_PITCH));
    for (let bar = 0; bar < bars; bar++) {
      const from = Math.floor((bar / bars) * peaks.length);
      const to = Math.max(from + 1, Math.floor(((bar + 1) / bars) * peaks.length));
      let peak = 0;
      for (let i = from; i < to; i++) if (peaks[i] > peak) peak = peaks[i];

      const position = (bar + 0.5) / bars;
      if (position > done) break;
      const h = Math.max(1, Math.min(1, peak * scale) * (height - 2));
      context.fillStyle = position <= progress ? played : rest;
      context.fillRect(bar * BAR_PITCH, (height - h) / 2, BAR_PITCH - 1, h);
    }
  }, [peaks, done, progress, width, height]);

  if (!onSeek) {
    return <canvas ref={canvas} className="block w-full" style={{ height }} />;
  }

  return (
    <canvas
      ref={canvas}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
        else return;
        // The browser around this would otherwise read the arrow as navigation.
        e.preventDefault();
        e.stopPropagation();
      }}
      className="block w-full cursor-pointer"
      style={{ height }}
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Settled once per visit to /files: whether this reader is the owner. A
 * visitor gets a 200 saying no, so a failed probe (throttled, down) is not
 * an answer and is asked again next time.
 */
let ownerCheck: Promise<boolean> | null = null;

function checkOwner(): Promise<boolean> {
  if (ownerCheck) return ownerCheck;
  const probe: Promise<boolean> = fetch("/api/files/thumbs")
    .then((r) => {
      if (!r.ok) throw new Error(`owner probe ${r.status}`);
      return r.json() as Promise<{ owner?: boolean }>;
    })
    .then((body) => body.owner === true)
    .catch(() => {
      // Only this probe's own slot: a later visit may have started another.
      if (ownerCheck === probe) ownerCheck = null;
      return false;
    });
  ownerCheck = probe;
  return probe;
}

/** Leaving /files: the next visit asks again. */
export function forgetOwnerCheck(): void {
  ownerCheck = null;
}

type FolderThumbs = Record<string, { uploaded: number; kinds: ThumbKind[] }>;

/** Waits out a 429 as the server asks, a few times, then gives up. */
async function postWithRetry(form: FormData): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/files/thumbs", { method: "POST", body: form });
    if (response.status !== 429 || attempt >= 4) return response;
    const wait = Number(response.headers.get("retry-after")) || 30;
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
}

function complete(entry: FolderThumbs[string] | undefined, uploaded: number, kind: PreviewKind) {
  if (!entry || entry.uploaded !== uploaded) return false;
  const has = (k: ThumbKind) => entry.kinds.includes(k);
  return kind === "video"
    ? has("poster.webp") && has("strip.webp") && has("strip.json")
    : has("peaks.json");
}

type Progress = { done: number; total: number; current: string | null; stored: number; skipped: number; failed: number };

/** Owner only: stores previews for every media file directly in `folder`. */
export function Backfill({ folder, base, onDone }: { folder: string; base: string; onDone?: () => void }) {
  const [owner, setOwner] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    let live = true;
    void checkOwner().then((o) => live && setOwner(o));
    return () => {
      live = false;
      cancelled.current = true;
    };
  }, []);

  if (!owner) return null;

  const run = async () => {
    cancelled.current = false;
    setError(null);
    // Safari hands back a PNG when asked for WebP; refuse here rather than
    // failing every file in turn.
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    if (!probe.toDataURL("image/webp").startsWith("data:image/webp")) {
      setError("This browser can't encode WebP. Run this from Chrome or Firefox.");
      return;
    }
    try {
      const prefix = encodeURIComponent(folder);
      const [listing, existing] = await Promise.all([
        fetchJson(`/api/files/list?prefix=${prefix}`) as Promise<R2Listing & { error?: string }>,
        fetch(`/api/files/thumbs?prefix=${prefix}`, { cache: "no-store" }).then(
          (r) => r.json() as Promise<{ thumbs?: FolderThumbs; error?: string }>,
        ),
      ]);
      if (listing.error || existing.error || !existing.thumbs) {
        throw new Error("Couldn't list this folder");
      }
      const thumbs = existing.thumbs;

      const todo = listing.files.flatMap(([name, , uploaded]) => {
        const kind = previewKind(name);
        return kind && !complete(thumbs[name], uploaded, kind) ? [{ name, kind }] : [];
      });

      const tally: Progress = { done: 0, total: todo.length, current: null, stored: 0, skipped: 0, failed: 0 };
      setProgress({ ...tally });
      const preview = await loadPreview();

      for (const { name } of todo) {
        if (cancelled.current) break;
        const key = folder + name;
        setProgress({ ...tally, current: name });
        try {
          const built = await preview.buildThumbs(publicUrl(base, key));
          if (!built.ok) {
            tally.skipped++;
          } else {
            const form = new FormData();
            form.set("key", key);
            for (const [kind, blob] of Object.entries(built.parts)) form.set(kind, blob, kind);
            const response = await postWithRetry(form);
            if (!response.ok) throw new Error(`upload ${response.status}`);
            tally.stored++;
          }
        } catch (err) {
          console.error("[files] backfill failed for", key, err);
          tally.failed++;
        }
        tally.done++;
        setProgress({ ...tally });
      }

      setProgress({ ...tally, current: null });
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
      setProgress(null);
    }
  };

  const running = progress !== null && progress.current !== null;

  return (
    <div className="fb-backfill">
      {running ? (
        <>
          <span className="max-w-full truncate">
            {progress.done + 1} of {progress.total}: {progress.current}
          </span>
          <button
            type="button"
            onClick={() => {
              cancelled.current = true;
            }}
            className="fb-textbtn"
          >
            Stop after this file
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={run} className="fb-btn">
            Generate previews for this folder
          </button>
          {progress && (
            <span>
              {progress.total === 0
                ? "Every file here already has previews."
                : `Stored ${progress.stored}, skipped ${progress.skipped}, failed ${progress.failed}.`}
            </span>
          )}
          {error && <span className="err">{error}</span>}
        </>
      )}
    </div>
  );
}
