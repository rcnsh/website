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

const FORMATS = [MP4, QTFF, WEBM, MATROSKA, MP3, WAVE, OGG, FLAC, ADTS];

export function openInput(url: string): Input {
  return new Input({
    source: new UrlSource(url, {
      maxCacheSize: 16 * 1024 * 1024,
      getRetryDelay: (attempts) => (attempts < 2 ? 0.5 * (attempts + 1) : null),
    }),
    formats: FORMATS,
  });
}

export type Timing = { start: number; duration: number };

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

export async function coverArt(input: Input): Promise<ImageBitmap | null> {
  const { images = [] } = await input.getMetadataTags();
  const image = images.find((i) => i.kind === "coverFront") ?? images[0];
  if (!image) return null;
  try {
    return await createImageBitmap(new Blob([image.data as BlobPart], { type: image.mimeType }));
  } catch {
    return null;
  }
}

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
