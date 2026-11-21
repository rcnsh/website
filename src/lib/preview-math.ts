export const WEBP_MAX_DIMENSION = 16383;

export type Box = { width: number; height: number };

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
  tile: Box;
  width: number;
  height: number;
};

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

export function spriteCell(layout: SpriteLayout, index: number): { x: number; y: number } {
  const i = Math.min(Math.max(0, Math.floor(index)), layout.frames - 1);
  return {
    x: (i % layout.columns) * layout.tile.width,
    y: Math.floor(i / layout.columns) * layout.tile.height,
  };
}

export function frameAt(fraction: number, frames: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(frames - 1, Math.floor(fraction * frames));
}

export function stripTimestamps(start: number, duration: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => start + ((i + 0.5) / frames) * duration);
}

export function posterTimestamp(start: number, duration: number): number {
  return start + Math.min(duration * 0.1, 10);
}

export const PEAK_COUNT = 1000;

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

  const totalFrames = duration * sampleRate;
  const offset = Math.round(startSeconds * sampleRate);

  let frame = 0;
  while (frame < frames) {
    const bin = Math.floor(((offset + frame) * bins) / totalFrames);
    if (bin >= bins) break;
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

export function quantizePeaks(peaks: ArrayLike<number>): number[] {
  return Array.from(peaks, (p) => Math.round(Math.min(1, Math.max(0, p)) * 255));
}

export function dequantizePeaks(values: readonly number[]): Float32Array {
  return Float32Array.from(values, (v) => Math.min(255, Math.max(0, v)) / 255);
}
