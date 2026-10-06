import {
  ADTS,
  AudioBufferSink,
  CanvasSink,
  FLAC,
  Input,
  MATROSKA,
  MP3,
  MP4,
  OGG,
  QTFF,
  UrlSource,
  WAVE,
  WEBM,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import type { PeaksSidecar, StripSidecar, ThumbKind } from "@/lib/thumbs";
import {
  accumulatePeaks,
  fitBox,
  PEAK_COUNT,
  posterTimestamp,
  quantizePeaks,
  spriteCell,
  spriteLayout,
  stripTimestamps,
  type Box,
  type SpriteLayout,
} from "@/lib/preview-math";

// Browser-side preview generation. Loaded with a dynamic import() from the
// preview panel, so Mediabunny never lands in the page's main bundle; only
// what is imported above is bundled.

/**
 * What /files previews: ALL_FORMATS less HLS and MPEG-TS, whose demuxers are
 * most of the weight and which nobody drops in a file bucket to preview.
 */
const FORMATS = [MP4, QTFF, WEBM, MATROSKA, MP3, WAVE, OGG, FLAC, ADTS];

/** Ranged reads straight off the bucket's public URL. */
export function openInput(url: string): Input {
  return new Input({
    source: new UrlSource(url, {
      // A preview is a few ranged reads; the 64 MiB default would let one
      // panel keep a whole video in memory.
      maxCacheSize: 16 * 1024 * 1024,
      // A CORS refusal or a 404 will not fix itself. Mediabunny already gives
      // up early on suspected CORS errors; this bounds everything else.
      getRetryDelay: (attempts) => (attempts < 2 ? 0.5 * (attempts + 1) : null),
    }),
    formats: FORMATS,
  });
}

export type Timing = { start: number; duration: number };

/**
 * Where the track starts and how long it runs. The server's duration is
 * preferred; recomputing it here can mean reading the whole file.
 */
export async function trackTiming(
  track: InputVideoTrack | InputAudioTrack,
  knownDuration: number | null,
): Promise<Timing> {
  const start = Math.max(0, await track.getFirstTimestamp());
  const end =
    knownDuration ??
    (await track.getDurationFromMetadata()) ??
    (await track.computeDuration());
  return { start, duration: Math.max(0, end - start) };
}

export const POSTER_MAX: Box = { width: 640, height: 480 };
export const STRIP_FRAMES = 24;
// Shown full-size while scrubbing, so larger than a tooltip thumbnail would be.
export const STRIP_TILE_MAX: Box = { width: 240, height: 240 };

async function displayBox(track: InputVideoTrack): Promise<Box> {
  return {
    width: await track.getDisplayWidth(),
    height: await track.getDisplayHeight(),
  };
}

export async function renderPoster(
  track: InputVideoTrack,
  timing: Timing,
): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
  const box = fitBox(await displayBox(track), POSTER_MAX);
  // No pool: the canvas is kept for as long as the panel shows it.
  const sink = new CanvasSink(track, { ...box, fit: "contain" });
  const frame =
    (await sink.getCanvas(posterTimestamp(timing.start, timing.duration))) ??
    (await sink.getCanvas(timing.start));
  return frame?.canvas ?? null;
}

export type Strip = {
  canvas: HTMLCanvasElement;
  layout: SpriteLayout;
  timestamps: number[];
};

/**
 * A sprite sheet of evenly spaced frames. Each decoded frame is copied into
 * the sheet as it arrives, so a pool of two canvases is enough.
 */
export async function renderStrip(track: InputVideoTrack, timing: Timing): Promise<Strip> {
  const tile = fitBox(await displayBox(track), STRIP_TILE_MAX);
  const layout = spriteLayout(STRIP_FRAMES, tile);
  const timestamps = stripTimestamps(timing.start, timing.duration, STRIP_FRAMES);

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas context");

  const sink = new CanvasSink(track, { ...tile, fit: "contain", poolSize: 2 });
  let index = 0;
  for await (const frame of sink.canvasesAtTimestamps(timestamps)) {
    if (frame) {
      const { x, y } = spriteCell(layout, index);
      context.drawImage(frame.canvas, x, y, tile.width, tile.height);
    }
    index++;
  }

  return { canvas, layout, timestamps };
}

/**
 * Waveform peaks, folded in chunk by chunk: each decoded AudioBuffer is
 * reduced into the bins and dropped, so memory stays flat however long the
 * file is. `onProgress` receives the running peaks and the fraction done.
 */
export async function computePeaks(
  track: InputAudioTrack,
  timing: Timing,
  onProgress?: (peaks: Float32Array, done: number) => void,
): Promise<Float32Array> {
  const peaks = new Float32Array(PEAK_COUNT);
  const sink = new AudioBufferSink(track);
  let lastReport = 0;

  for await (const { buffer, timestamp } of sink.buffers()) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c),
    );
    accumulatePeaks(peaks, channels, timestamp - timing.start, buffer.sampleRate, timing.duration);

    const now = performance.now();
    if (onProgress && now - lastReport > 120) {
      lastReport = now;
      onProgress(peaks, timing.duration > 0 ? (timestamp - timing.start) / timing.duration : 0);
    }
  }

  onProgress?.(peaks, 1);
  return peaks;
}

/** The front cover if tagged as one, else the first embedded image. */
export async function coverArt(input: Input): Promise<ImageBitmap | null> {
  const { images = [] } = await input.getMetadataTags();
  const image = images.find((i) => i.kind === "coverFront") ?? images[0];
  if (!image) return null;
  try {
    return await createImageBitmap(new Blob([image.data as BlobPart], { type: image.mimeType }));
  } catch {
    // A tag can claim any type; an undecodable one is just no cover.
    return null;
  }
}

/**
 * WebP bytes from a canvas. Throws where the browser cannot encode WebP:
 * Safari hands back a PNG instead, which the upload route would refuse.
 */
export async function encodeWebp(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = 0.8,
): Promise<Blob> {
  const blob =
    "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type: "image/webp", quality })
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (blob?.type !== "image/webp") {
    throw new Error("This browser cannot encode WebP");
  }
  return blob;
}

/**
 * A canvas as a data: URL, for an <img> or a CSS background. In memory only,
 * and `img-src` already admits `data:`, so no `blob:` grant is needed.
 */
export function toDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): string {
  let source = canvas;
  if (!("toDataURL" in source)) {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    source = copy;
  }
  return source.toDataURL("image/jpeg", 0.85);
}

export function stripSidecar(strip: Strip): StripSidecar {
  return {
    version: 1,
    frames: strip.layout.frames,
    columns: strip.layout.columns,
    tileWidth: strip.layout.tile.width,
    tileHeight: strip.layout.tile.height,
    timestamps: strip.timestamps.map((t) => Math.round(t * 1000) / 1000),
  };
}

export function peaksSidecar(peaks: Float32Array, timing: Timing): PeaksSidecar {
  return { version: 1, duration: timing.duration, peaks: quantizePeaks(peaks) };
}

const json = (value: unknown) =>
  new Blob([JSON.stringify(value)], { type: "application/json" });

export type BuiltThumbs =
  | { ok: true; parts: Partial<Record<ThumbKind, Blob>> }
  | { ok: false; reason: "unreadable" | "undecodable" };

/**
 * Everything the owner backfill uploads for one file: poster and strip for a
 * video, peaks for audio. No size cap here, unlike a visitor's waveform.
 */
export async function buildThumbs(url: string): Promise<BuiltThumbs> {
  const input = openInput(url);
  try {
    if (!(await input.canRead())) return { ok: false, reason: "unreadable" };

    const video = await input.getPrimaryVideoTrack();
    if (video) {
      if (!(await video.canDecode())) return { ok: false, reason: "undecodable" };
      const timing = await trackTiming(video, null);
      const poster = await renderPoster(video, timing);
      const strip = await renderStrip(video, timing);
      return {
        ok: true,
        parts: {
          ...(poster ? { "poster.webp": await encodeWebp(poster) } : {}),
          "strip.webp": await encodeWebp(strip.canvas),
          "strip.json": json(stripSidecar(strip)),
        },
      };
    }

    const audio = await input.getPrimaryAudioTrack();
    if (!audio) return { ok: false, reason: "unreadable" };
    if (!(await audio.canDecode())) return { ok: false, reason: "undecodable" };
    const timing = await trackTiming(audio, null);
    const peaks = await computePeaks(audio, timing);
    return { ok: true, parts: { "peaks.json": json(peaksSidecar(peaks, timing)) } };
  } finally {
    input.dispose();
  }
}
