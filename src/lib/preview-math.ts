// Layout and signal maths behind the media previews, out of the components so
// it can be tested. No DOM, no Mediabunny.

/** WebP refuses anything wider or taller than this. */
export const WEBP_MAX_DIMENSION = 16383;

export type Box = { width: number; height: number };

/**
 * The largest box of the source's aspect ratio inside `max`, in whole pixels
 * and never below 1. Never larger than the source: upscaling only costs bytes.
 * Hands CanvasSink an exact size so `fit: "contain"` never has to letterbox
 * more than a rounding pixel.
 */
export function fitBox(source: Box, max: Box): Box {
  if (source.width <= 0 || source.height <= 0) return { ...max };
  const scale = Math.min(1, max.width / source.width, max.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export type SpriteLayout = {
  frames: number;
  columns: number;
  rows: number;
  /** One cell. */
  tile: Box;
  /** The whole sheet. */
  width: number;
  height: number;
};

/** Frames per sheet row. Wide enough to keep the sheet close to square. */
const DEFAULT_COLUMNS = 6;

export function spriteLayout(
  frames: number,
  tile: Box,
  maxColumns = DEFAULT_COLUMNS,
): SpriteLayout {
  if (!Number.isInteger(frames) || frames < 1) {
    throw new RangeError(`A sprite needs at least one frame, got ${frames}`);
  }
  const columns = Math.min(frames, Math.max(1, Math.floor(maxColumns)));
  const rows = Math.ceil(frames / columns);
  const width = columns * tile.width;
  const height = rows * tile.height;
  if (width > WEBP_MAX_DIMENSION || height > WEBP_MAX_DIMENSION) {
    throw new RangeError(`A ${width}x${height} sprite is too large to encode as WebP`);
  }
  return { frames, columns, rows, tile: { ...tile }, width, height };
}

/** Top-left corner of frame `index` within the sheet, row-major. */
export function spriteCell(layout: SpriteLayout, index: number): { x: number; y: number } {
  const i = Math.min(Math.max(0, Math.floor(index)), layout.frames - 1);
  return {
    x: (i % layout.columns) * layout.tile.width,
    y: Math.floor(i / layout.columns) * layout.tile.height,
  };
}

/** Which of `frames` evenly spaced frames a pointer at `fraction` (0..1) shows. */
export function frameAt(fraction: number, frames: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(frames - 1, Math.floor(fraction * frames));
}

/**
 * Where each strip frame is taken: the midpoint of each of `frames` equal
 * slices, so neither the black first frame nor the end card is picked.
 */
export function stripTimestamps(start: number, duration: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => start + ((i + 0.5) / frames) * duration);
}

/** A tenth of the way in, capped: far enough past a fade-in, early enough to be representative. */
export function posterTimestamp(start: number, duration: number): number {
  return start + Math.min(duration * 0.1, 10);
}

/** Peaks drawn for a waveform. More than a panel is wide, so it stays crisp at 2x. */
export const PEAK_COUNT = 1000;

/**
 * Folds one decoded chunk into running per-bin peaks, so the whole signal is
 * never held at once. `peaks` is the absolute maximum seen in each bin; the
 * chunk's samples are mapped to bins by time, which makes chunks order-free.
 */
export function accumulatePeaks(
  peaks: Float32Array,
  channels: ArrayLike<number>[],
  startSeconds: number,
  sampleRate: number,
  duration: number,
): void {
  const bins = peaks.length;
  const frames = channels[0]?.length ?? 0;
  if (frames === 0 || bins === 0 || !(duration > 0) || !(sampleRate > 0)) return;

  // Bins are assigned by whole frame position, not by time: in floating point
  // a sample on a bin edge would land on either side depending on where the
  // decoder happened to split its chunks.
  const totalFrames = duration * sampleRate;
  const offset = Math.round(startSeconds * sampleRate);

  let frame = 0;
  while (frame < frames) {
    const bin = Math.floor(((offset + frame) * bins) / totalFrames);
    if (bin >= bins) break;
    // First frame belonging to the next bin, or the chunk's end.
    const nextBin = Math.ceil(((bin + 1) * totalFrames) / bins) - offset;
    const end = Math.min(frames, Math.max(nextBin, frame + 1));

    if (bin >= 0) {
      let peak = peaks[bin];
      for (const channel of channels) {
        for (let i = frame; i < end; i++) {
          const v = channel[i];
          const abs = v < 0 ? -v : v;
          if (abs > peak) peak = abs;
        }
      }
      peaks[bin] = peak;
    }
    frame = end;
  }
}

/** Peaks as 0..255 integers: a JSON sidecar a quarter the size of decimals. */
export function quantizePeaks(peaks: ArrayLike<number>): number[] {
  return Array.from(peaks, (p) => Math.round(Math.min(1, Math.max(0, p)) * 255));
}

export function dequantizePeaks(values: readonly number[]): Float32Array {
  return Float32Array.from(values, (v) => Math.min(255, Math.max(0, v)) / 255);
}
