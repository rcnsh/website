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
  /**
   * The share of the full range (0..1) a cover's own range must span before
   * it is stretched at all, and the share at which it is stretched fully.
   * Below `flat` the cover is drawn at its real brightness: an all-black
   * sleeve has nothing to stretch, and stretching it anyway lights the whole
   * field.
   */
  flat: 0.06,
  full: 0.3,
  /**
   * The bottom of the stretched range that stays black. A gamma under 1 is
   * steepest at zero, so without this the grain in a black background is
   * lifted a whole level.
   */
  toe: 0.08,
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

const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** A stretched value (0..1) through the gamma, with the toe held black. */
const shaped = (stretched: number, gamma: number, toe: number) =>
  stretched ** gamma * (toe > 0 ? smoothstep(0, toe, stretched) : 1);

/** The gamma that brings the mean of `values` (each 0..1) to `target`, within bounds. */
export function gammaForMean(values: ArrayLike<number>, target: number, min: number, max: number, toe = 0): number {
  const meanAt = (gamma: number) => {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += shaped(values[i]!, gamma, toe);
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
export type ToneCurve = {
  black: number;
  white: number;
  gamma: number;
  /** 0..1: how far the stretch is trusted over the cover's real brightness. */
  strength: number;
  toe: number;
};

/**
 * The curve for a cover, from its luminances (0..255). `field.ts` measures it
 * once on a fixed-size copy and applies it to the texture at whatever size
 * the lattice wants, so the picture's tone never moves with the window.
 */
export function toneCurve(lums: ArrayLike<number>, options: ToneOptions = TONE): ToneCurve {
  const plain: ToneCurve = { black: 0, white: 255, gamma: 1, strength: 0, toe: 0 };
  if (lums.length === 0) return plain;
  const sorted = Float32Array.from(lums).sort();
  const black = percentile(sorted, options.low);
  const white = percentile(sorted, options.high);
  // Little or no range of its own: the cover keeps its real brightness, so
  // a black sleeve stays black and a white one stays white.
  const strength = smoothstep(options.flat, options.full, (white - black) / 255);
  if (strength === 0) return plain;
  const stretched = new Float32Array(lums.length);
  for (let i = 0; i < lums.length; i++) stretched[i] = clamp01((lums[i]! - black) / (white - black));
  const gamma = gammaForMean(stretched, options.mean, options.minGamma, options.maxGamma, options.toe);
  return { black, white, gamma, strength, toe: options.toe };
}

/** One luminance (0..255) through a curve, to a tone 0..1. */
export function applyTone(lum: number, { black, white, gamma, strength, toe }: ToneCurve): number {
  const real = clamp01(lum / 255);
  if (strength === 0) return real;
  const stretched = clamp01((lum - black) / (white - black));
  return real + (shaped(stretched, gamma, toe) - real) * strength;
}

/** Luminances (0..255) in, tones (0..1) out, in the same order. */
export function toneMap(lums: ArrayLike<number>, options: ToneOptions = TONE): Float32Array {
  const curve = toneCurve(lums, options);
  return Float32Array.from(lums, (lum) => applyTone(lum, curve));
}
