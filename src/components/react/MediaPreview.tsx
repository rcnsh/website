import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Play, X } from "lucide-react";
import type { Input } from "mediabunny";
import type { MediaMeta } from "@/lib/media-meta";
import { dequantizePeaks, frameAt, spriteLayout, type SpriteLayout } from "@/lib/preview-math";
import type { R2Listing } from "@/lib/r2";
import {
  parsePeaksSidecar,
  parseStripSidecar,
  publicUrl,
  thumbKey,
  type ThumbKind,
  type ThumbSet,
} from "@/lib/thumbs";
import { cn, fileKind, formatBytes } from "@/lib/utils";

/** Mediabunny and the generators, fetched the first time a preview opens. */
const loadPreview = () => import("@/lib/media-preview");

/**
 * A visitor's browser downloads the whole file to draw a waveform, so past
 * this it plays without one. The owner backfill has no such cap.
 */
const VISITOR_WAVEFORM_MAX_BYTES = 64 * 1024 * 1024;

type Meta = MediaMeta & { size?: number; uploaded?: number; thumbs?: ThumbSet };
type Supported = Extract<MediaMeta, { supported: true }> & { thumbs?: ThumbSet };

export type PreviewKind = "video" | "audio";

export function previewKind(name: string): PreviewKind | null {
  const kind = fileKind(name);
  return kind === "video" || kind === "audio" ? kind : null;
}

async function fetchMeta(key: string, reload = false): Promise<Meta> {
  const response = await fetch(`/api/files/meta?key=${encodeURIComponent(key)}`, {
    cache: reload ? "reload" : "default",
  });
  if (!response.ok) throw new Error(`meta ${response.status}`);
  return (await response.json()) as Meta;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

function thumbUrl(base: string, key: string, kind: ThumbKind): string | null {
  // Without a public domain thumbs are unreachable: the download route
  // refuses hidden keys. The browser draws its own instead.
  const target = base ? thumbKey(key, kind) : null;
  return target ? publicUrl(base, target) : null;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** The first rejection that is not us tearing the panel down. */
function isTeardown(error: unknown): boolean {
  return error instanceof Error && error.name === "InputDisposedError";
}

type Props = {
  fileKey: string;
  kind: PreviewKind;
  size: number;
  bucketBase: string;
  onClose: () => void;
};

export default function MediaPreview({ fileKey, kind, size, bucketBase, onClose }: Props) {
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

  return (
    <div className="my-2 rounded-xs border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink" title={fileKey}>
          {fileKey.split("/").pop()}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in a new tab"
          className="-m-1 p-1 text-ink-faint transition-colors hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="-m-1 p-1 text-ink-faint transition-colors hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {metaFailed ? (
        <Fallback url={url} message="Couldn't read this file's details just now." />
      ) : !meta ? (
        <div className="placeholder-block aspect-video w-full rounded-xs" />
      ) : !meta.supported ? (
        <Fallback url={url} message="No preview for this format." />
      ) : kind === "video" && meta.video ? (
        <VideoPreview fileKey={fileKey} url={url} base={bucketBase} meta={meta} />
      ) : (
        <AudioPreview fileKey={fileKey} url={url} base={bucketBase} meta={meta} size={size} />
      )}

      {meta?.supported && <Details meta={meta} size={size} />}

      {bucketBase && (
        <Backfill folder={folder} base={bucketBase} onDone={() => setRevision((r) => r + 1)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Fallback({ url, message, meta }: { url: string; message: string; meta?: Supported }) {
  const codecs = [meta?.video?.codec, meta?.audio?.codec].filter(Boolean).join(" and ");
  return (
    <div className="rounded-xs border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm text-ink-dim">{message}</p>
      {codecs && (
        <p className="mt-1 font-mono text-[11px] text-ink-faint">
          Encoded as {codecs}.
        </p>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-brand underline decoration-line-strong underline-offset-[4px] transition-colors hover:decoration-brand"
      >
        <Download className="h-3.5 w-3.5" />
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

  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-faint">{label}</dt>
          <dd className="min-w-0 truncate text-ink-dim" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */

type StripView = { src: string; layout: SpriteLayout; timestamps: number[] };

/** Tallest the video stage gets, in CSS pixels. */
const STAGE_MAX_HEIGHT = 480;

type VideoState = "loading" | "ready" | "undecodable" | "unplayable";

function VideoPreview({
  fileKey,
  url,
  base,
  meta,
}: {
  fileKey: string;
  url: string;
  base: string;
  meta: Supported;
}) {
  const [state, setState] = useState<VideoState>("loading");
  const [poster, setPoster] = useState<string | null>(null);
  const [strip, setStrip] = useState<StripView | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

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

  if (state === "undecodable" || state === "unplayable") {
    return (
      <Fallback
        url={url}
        meta={meta}
        message={
          state === "undecodable"
            ? "This browser can't decode this video."
            : "This browser can't play this video."
        }
      />
    );
  }

  if (playing) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: arbitrary uploads have no captions to offer
      <video
        src={url}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        onError={() => setState("unplayable")}
        className="mx-auto block rounded-xs bg-black"
        style={stageStyle}
      />
    );
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!strip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setScrub(frameAt((event.clientX - rect.left) / rect.width, strip.layout.frames));
  };

  const columns = strip?.layout.columns ?? 1;
  const rows = strip?.layout.rows ?? 1;
  const cellStyle =
    strip && scrub !== null
      ? {
          backgroundImage: `url("${strip.src}")`,
          backgroundSize: `${columns * 100}% ${rows * 100}%`,
          backgroundPosition: `${columns > 1 ? ((scrub % columns) / (columns - 1)) * 100 : 0}% ${
            rows > 1 ? (Math.floor(scrub / columns) / (rows - 1)) * 100 : 0
          }%`,
        }
      : undefined;

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setScrub(null)}
      aria-label="Play video"
      className="group relative mx-auto block overflow-hidden rounded-xs bg-black"
      style={stageStyle}
    >
      {state === "loading" && !poster && <span className="placeholder-block absolute inset-0" />}
      {poster && (
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}
      {cellStyle && <span className="absolute inset-0 bg-no-repeat" style={cellStyle} />}

      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-base/70 p-3 text-ink transition-transform group-hover:scale-105">
          <Play className="h-5 w-5" />
        </span>
      </span>

      {strip && scrub !== null && (
        <>
          <span className="absolute bottom-2 left-2 rounded-xs bg-base/80 px-1.5 py-0.5 font-mono text-[11px] text-ink">
            {formatClock(strip.timestamps[scrub] ?? 0)}
          </span>
          <span
            className="absolute bottom-0 left-0 h-0.5 bg-brand"
            style={{ width: `${((scrub + 1) / strip.layout.frames) * 100}%` }}
          />
        </>
      )}
      {state === "ready" && !strip && (
        <span className="absolute right-2 bottom-2 font-mono text-[10px] text-ink-faint">
          building filmstrip…
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

type AudioState = "loading" | "ready" | "undecodable" | "unplayable";

function AudioPreview({
  fileKey,
  url,
  base,
  meta,
  size,
}: {
  fileKey: string;
  url: string;
  base: string;
  meta: Supported;
  size: number;
}) {
  const [state, setState] = useState<AudioState>("loading");
  const [cover, setCover] = useState<ImageBitmap | null>(null);
  const [peaks, setPeaks] = useState<{ values: Float32Array; done: number } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [position, setPosition] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);

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

  const duration = meta.duration ?? 0;
  const seek = useCallback(
    (fraction: number) => {
      const element = audio.current;
      if (!element || !(duration > 0)) return;
      element.currentTime = fraction * duration;
      if (element.paused) void element.play().catch(() => {});
    },
    [duration],
  );

  if (state === "undecodable" || state === "unplayable") {
    return (
      <Fallback
        url={url}
        meta={meta}
        message={
          state === "undecodable"
            ? "This browser can't decode this audio."
            : "This browser can't play this audio."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      {meta.tags.coverArt && (
        <div className="aspect-square w-32 shrink-0 overflow-hidden rounded-xs bg-raised sm:w-36">
          {cover ? <Cover bitmap={cover} /> : <span className="placeholder-block block h-full w-full" />}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-2">
        {peaks ? (
          <Waveform
            peaks={peaks.values}
            done={peaks.done}
            progress={duration > 0 ? position / duration : 0}
            onSeek={seek}
          />
        ) : skipped ? (
          <p className="font-mono text-[11px] text-ink-faint">
            Too large to draw a waveform in the browser.
          </p>
        ) : (
          <div className="placeholder-block h-16 w-full rounded-xs" />
        )}
        {/* biome-ignore lint/a11y/useMediaCaption: arbitrary uploads have no captions to offer */}
        <audio
          ref={audio}
          src={url}
          controls
          preload="metadata"
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onError={() => setState("unplayable")}
          className="h-9 w-full"
        />
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
  return <canvas ref={canvas} role="img" aria-label="Cover art" className="h-full w-full object-cover" />;
}

/** Bar width plus gap, in CSS pixels. */
const BAR_PITCH = 3;

function Waveform({
  peaks,
  done,
  progress,
  onSeek,
}: {
  peaks: Float32Array;
  /** How much of the file has been decoded so far, 0..1. */
  done: number;
  /** Playback position, 0..1. */
  progress: number;
  onSeek: (fraction: number) => void;
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

    const height = 64;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(element);
    const played = styles.getPropertyValue("--color-brand").trim() || "#7f8ad0";
    const rest = styles.getPropertyValue("--color-line-strong").trim() || "#58544f";

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
  }, [peaks, done, progress, width]);

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
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
      }}
      className="h-16 w-full cursor-pointer"
    />
  );
}

/* -------------------------------------------------------------------------- */

/** Settled once per page: whether this reader is the owner. */
let ownerCheck: Promise<boolean> | null = null;

function checkOwner(): Promise<boolean> {
  ownerCheck ??= fetch("/api/files/thumbs")
    .then((r) => (r.ok ? (r.json() as Promise<{ owner?: boolean }>) : { owner: false }))
    .then((body) => body.owner === true)
    .catch(() => {
      ownerCheck = null;
      return false;
    });
  return ownerCheck;
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

function Backfill({ folder, base, onDone }: { folder: string; base: string; onDone: () => void }) {
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
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
      setProgress(null);
    }
  };

  const running = progress !== null && progress.current !== null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-ink-faint">
      {running ? (
        <>
          <span className="min-w-0 truncate">
            {progress.done + 1} of {progress.total}: {progress.current}
          </span>
          <button
            type="button"
            onClick={() => {
              cancelled.current = true;
            }}
            className="text-ink-dim underline decoration-line-strong underline-offset-[4px] hover:text-ink"
          >
            Stop after this file
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={run}
            className={cn(
              "text-ink-dim underline decoration-line-strong underline-offset-[4px] transition-colors hover:text-ink hover:decoration-brand",
            )}
          >
            Generate previews for this folder
          </button>
          {progress && (
            <span>
              {progress.total === 0
                ? "Every file here already has previews."
                : `Stored ${progress.stored}, skipped ${progress.skipped}, failed ${progress.failed}.`}
            </span>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </>
      )}
    </div>
  );
}
