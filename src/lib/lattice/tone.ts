/**
 * How a cover's luminance is spread over the field's five levels. Pure, so
 * `cover.ts` runs it on a shrunk copy's pixels and the tests run it on
 * numbers.
 *
 * Two steps. The range is taken between low and high percentiles, not the
 * extremes, so one specular highlight or a black border cannot squeeze the
 * rest of the cover into one or two levels. Then a gamma is chosen so the
 * cover's mean lands at `TONE.mean`: a dark sleeve's mid-tones are lifted
 * across the levels, while a cover that is already bright in places (a black
 * bird on yellow) is lifted far less, because its highlights already carry
 * the mean. The gamma is held to a range so noise in a near-black cover is
 * not blown up, and a bright cover is only darkened a little.
 */

export const TONE = {
  /** Percentiles that become black and white. */
  low: 0.02,
  high: 0.98,
  /**
   * Where the mean of the mapped cover should land, 0..1. Lower than a
   * plain look would pick: the dissolve keeps bright triangles longest and
   * the dither spreads mid-tones up a level, so at 0.35 a dark sleeve came
   * out lighter than it feels and black-on-yellow lost its black.
   */
  mean: 0.28,
  minGamma: 0.4,
  maxGamma: 1.25,
} as const;

export type ToneOptions = typeof TONE;

/** Rec. 601 luma of 0..255 channels, the weights the shader uses. */
export const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Linear interpolation between the closest ranks of an ascending list. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const below = Math.floor(at);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (at - below);
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** The gamma that brings the mean of `values` (each 0..1) to `target`, within bounds. */
export function gammaForMean(values: ArrayLike<number>, target: number, min: number, max: number): number {
  const meanAt = (gamma: number) => {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i]! ** gamma;
    return sum / Math.max(values.length, 1);
  };
  // The mean falls as the gamma rises, so bisect.
  if (meanAt(min) <= target) return min;
  if (meanAt(max) >= target) return max;
  let lo = min;
  let hi = max;
  for (let step = 0; step < 24; step++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A cover's tone curve: which luminances become black and white, and the gamma between. */
export type ToneCurve = { black: number; white: number; gamma: number };

/**
 * The curve for a cover, from its luminances (0..255). `field.ts` measures it
 * once on a fixed-size copy and applies it to the texture at whatever size
 * the lattice wants, so the picture's tone never moves with the window.
 */
export function toneCurve(lums: ArrayLike<number>, options: ToneOptions = TONE): ToneCurve {
  if (lums.length === 0) return { black: 0, white: 255, gamma: 1 };
  const sorted = Float32Array.from(lums).sort();
  const black = percentile(sorted, options.low);
  const white = percentile(sorted, options.high);
  // One flat colour has no range to stretch: mid-grey rather than black.
  if (white - black < 1) return { black: black - 127.5, white: black + 127.5, gamma: 1 };
  const stretched = new Float32Array(lums.length);
  for (let i = 0; i < lums.length; i++) stretched[i] = clamp01((lums[i]! - black) / (white - black));
  return { black, white, gamma: gammaForMean(stretched, options.mean, options.minGamma, options.maxGamma) };
}

/** One luminance (0..255) through a curve, to a tone 0..1. */
export const applyTone = (lum: number, { black, white, gamma }: ToneCurve) =>
  clamp01((lum - black) / (white - black)) ** gamma;

/** Luminances (0..255) in, tones (0..1) out, in the same order. */
export function toneMap(lums: ArrayLike<number>, options: ToneOptions = TONE): Float32Array {
  const curve = toneCurve(lums, options);
  return Float32Array.from(lums, (lum) => applyTone(lum, curve));
}
