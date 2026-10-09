import { useEffect, useRef, useState } from "react";
import { type Entry, formatDay } from "@/lib/files-nav";
import { dequantizePeaks } from "@/lib/preview-math";
import { firstLines, TEXT_PREVIEW_BYTES } from "@/lib/text-preview";
import { parsePeaksSidecar, publicUrl } from "@/lib/thumbs";
import { fileKind, formatBytes } from "@/lib/utils";
import { DetailList, Fallback, Waveform } from "@/components/react/MediaPreview";
import { fetchJson, fetchMeta, formatClock, loadPreview, queue, thumbUrl } from "./client";
import { KIND_COLOUR } from "./kinds";
import { FileIcon, FolderIcon, PlayIcon } from "./icons";

export function EntryIcon({ entry, size = 16 }: { entry: Pick<Entry, "dir" | "name">; size?: number }) {
  if (entry.dir) {
    return (
      <span className="fb-ki" style={{ color: "var(--color-brand)" }}>
        <FolderIcon size={size} />
      </span>
    );
  }
  const kind = fileKind(entry.name);
  return (
    <span className="fb-ki" style={{ color: KIND_COLOUR[kind] }}>
      <FileIcon kind={kind} size={size} />
    </span>
  );
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

/* -------------------------------------------------------------------------- */

export function ImagePreview({ entry, base }: { entry: Entry; base: string }) {
  const url = publicUrl(base, entry.key);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const ext = extension(entry.name).toUpperCase();
  const rows: [string, string][] = [];
  if (box) rows.push(["Dimensions", `${box.width}×${box.height}`]);
  rows.push(["Format", ext === "JPG" ? "JPEG" : ext]);
  if (entry.size !== null) rows.push(["Size", formatBytes(entry.size)]);
  if (entry.uploaded) rows.push(["Uploaded", formatDay(entry.uploaded)]);
  rows.push(["Key", entry.key]);

  if (failed) {
    return (
      <>
        <Fallback
          url={url}
          name={entry.name}
          size={entry.size ?? 0}
          uploaded={entry.uploaded ?? undefined}
          message="Couldn't show this image."
        />
        <DetailList rows={rows} />
      </>
    );
  }

  const aspect = box ? box.width / box.height : 4 / 3;
  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="fb-stage"
        style={{ aspectRatio: String(aspect), width: `min(100%, ${Math.round(340 * aspect)}px)` }}
        aria-label={`Open ${entry.name} full size`}
      >
        {!box && <span className="ph placeholder-block" />}
        <img
          src={url}
          alt=""
          decoding="async"
          onLoad={(e) =>
            setBox({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
          }
          onError={() => setFailed(true)}
        />
      </a>
      <DetailList rows={rows} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

type TextState = { lines: string[] } | "loading" | "binary" | "failed";

/** The first few KB of the file, read with one ranged request. */
async function readHead(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`head ${response.status}`);

  // A server that ignores Range sends the whole file; stop reading at the cap.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < TEXT_PREVIEW_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
  }
  void reader.cancel().catch(() => {});

  const bytes = new Uint8Array(Math.min(length, TEXT_PREVIEW_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, bytes.byteLength - offset);
    bytes.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= bytes.byteLength) break;
  }
  return bytes;
}

export function TextPreview({ entry, base }: { entry: Entry; base: string }) {
  const url = publicUrl(base, entry.key);
  const [state, setState] = useState<TextState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), 10_000);
    setState("loading");
    readHead(url, controller.signal)
      .then((bytes) => {
        const truncated = (entry.size ?? Number.POSITIVE_INFINITY) > bytes.byteLength;
        const lines = firstLines(bytes, truncated);
        setState(lines ? { lines } : "binary");
      })
      .catch(() => {
        if (!controller.signal.aborted || controller.signal.reason?.name === "TimeoutError") {
          setState("failed");
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, entry.size]);

  const rows: [string, string][] = [
    ["Type", fileKind(entry.name) === "code" ? `code · ${extension(entry.name).toLowerCase()}` : "text"],
  ];
  if (entry.size !== null) rows.push(["Size", formatBytes(entry.size)]);
  if (entry.uploaded) rows.push(["Uploaded", formatDay(entry.uploaded)]);
  rows.push(["Key", entry.key]);

  return (
    <>
      {state === "loading" ? (
        <div className="placeholder-block h-40 rounded-[5px]" />
      ) : typeof state === "object" ? (
        state.lines.length === 0 ? (
          <p className="fb-toobig">This file is empty.</p>
        ) : (
          <pre className="fb-head-of">
            {state.lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and never reorder
              <span key={i}>{line || " "}</span>
            ))}
          </pre>
        )
      ) : (
        <Fallback
          url={url}
          name={entry.name}
          size={entry.size ?? 0}
          uploaded={entry.uploaded ?? undefined}
          message={state === "binary" ? "No preview for this format." : "Couldn't read this file just now."}
        />
      )}
      <DetailList rows={rows} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Past this an image is a file to open, not a thumbnail to load. */
const CARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

type CardArt = {
  /** A poster or cover, as a URL an <img> can show. */
  src?: string;
  peaks?: Float32Array;
  duration?: number | null;
};

/** Metadata is a Worker round trip each; art is a decode. Both are rationed. */
const metaQueue = queue(3);
const artQueue = queue(1);
const artCache = new Map<string, Promise<CardArt>>();

async function cardArt(key: string, base: string): Promise<CardArt> {
  const meta = await metaQueue(() => fetchMeta(key));
  if (!meta.supported) return {};
  const duration = meta.duration;
  const kind = fileKind(key);

  if (kind === "video") {
    // Only a poster stamped for this upload counts; the meta route checks.
    const stored = meta.thumbs?.poster ? thumbUrl(base, key, "poster.webp") : null;
    if (stored) return { src: stored, duration };
    if (!meta.video) return { duration };
    return artQueue(async () => {
      const preview = await loadPreview();
      const input = preview.openInput(publicUrl(base, key));
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) return { duration };
        const canvas = await preview.renderPoster(track, await preview.trackTiming(track, duration));
        return { src: canvas ? preview.toDataUrl(canvas) : undefined, duration };
      } finally {
        input.dispose();
      }
    });
  }

  const peaksUrl = meta.thumbs?.peaks ? thumbUrl(base, key, "peaks.json") : null;
  if (peaksUrl) {
    const sidecar = parsePeaksSidecar(await fetchJson(peaksUrl).catch(() => null));
    if (sidecar) return { peaks: dequantizePeaks(sidecar.peaks), duration };
  }
  if (!meta.tags.coverArt) return { duration };
  return artQueue(async () => {
    const preview = await loadPreview();
    const input = preview.openInput(publicUrl(base, key));
    try {
      const bitmap = await preview.coverArt(input);
      if (!bitmap) return { duration };
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      return { src: preview.toDataUrl(canvas), duration };
    } finally {
      input.dispose();
    }
  });
}

function cachedCardArt(key: string, uploaded: number | null, base: string): Promise<CardArt> {
  const id = `${key}:${uploaded ?? ""}`;
  let art = artCache.get(id);
  if (!art) {
    art = cardArt(key, base);
    artCache.set(id, art);
    // Not remembered when it failed, so the next time the card shows retries.
    art.catch(() => artCache.delete(id));
  }
  return art;
}

/** A grid card's picture: stored thumbs first, in-browser generation after. */
export function CardThumb({ entry, base }: { entry: Entry; base: string }) {
  const kind = entry.dir ? null : fileKind(entry.name);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [art, setArt] = useState<CardArt | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const wantsArt = kind === "video" || kind === "audio";

  useEffect(() => {
    const element = ref.current;
    if (!element || !wantsArt) return;
    const observer = new IntersectionObserver(
      ([hit]) => {
        if (hit.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [wantsArt]);

  useEffect(() => {
    if (!visible || !wantsArt) return;
    let live = true;
    cachedCardArt(entry.key, entry.uploaded, base)
      .then((a) => live && setArt(a))
      .catch((error) => {
        if (live) setArt({});
        if (error instanceof Error && error.name !== "InputDisposedError") {
          console.warn("[files] no card art for", entry.key, error);
        }
      });
    return () => {
      live = false;
    };
  }, [visible, wantsArt, entry.key, entry.uploaded, base]);

  if (entry.dir) {
    return (
      <div ref={ref} className="fb-th">
        <EntryIcon entry={entry} size={36} />
      </div>
    );
  }

  const icon = (
    <>
      <EntryIcon entry={entry} size={34} />
      <span className="ext">{extension(entry.name)}</span>
    </>
  );

  if (kind === "image") {
    const show = !imageFailed && (entry.size ?? 0) <= CARD_IMAGE_MAX_BYTES;
    return (
      <div ref={ref} className="fb-th">
        {icon}
        {show && (
          <img
            src={publicUrl(base, entry.key)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    );
  }

  if (wantsArt) {
    const duration = art?.duration;
    return (
      <div ref={ref} className="fb-th">
        {art?.src ? (
          <img src={art.src} alt="" decoding="async" />
        ) : art?.peaks ? (
          <span className="wave" aria-hidden="true">
            <Waveform peaks={art.peaks} done={1} progress={1} height={46} />
          </span>
        ) : (
          icon
        )}
        {kind === "video" && art?.src && (
          <span className="play" aria-hidden="true">
            <PlayIcon size={14} />
          </span>
        )}
        {duration ? <span className="dur">{formatClock(duration)}</span> : null}
      </div>
    );
  }

  return (
    <div ref={ref} className="fb-th">
      {icon}
    </div>
  );
}
