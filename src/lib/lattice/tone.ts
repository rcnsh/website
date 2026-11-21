export const TONE = {
  low: 0.02,
  high: 0.98,
  mean: 0.28,
  minGamma: 0.4,
  maxGamma: 1.25,
  flat: 0.06,
  full: 0.3,
  toe: 0.08,
} as const;

export type ToneOptions = typeof TONE;

export const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

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

const shaped = (stretched: number, gamma: number, toe: number) =>
  stretched ** gamma * (toe > 0 ? smoothstep(0, toe, stretched) : 1);

export function gammaForMean(values: ArrayLike<number>, target: number, min: number, max: number, toe = 0): number {
  const meanAt = (gamma: number) => {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += shaped(values[i]!, gamma, toe);
    return sum / Math.max(values.length, 1);
  };
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

export type ToneCurve = {
  black: number;
  white: number;
  gamma: number;
  strength: number;
  toe: number;
};

export function toneCurve(lums: ArrayLike<number>, options: ToneOptions = TONE): ToneCurve {
  const plain: ToneCurve = { black: 0, white: 255, gamma: 1, strength: 0, toe: 0 };
  if (lums.length === 0) return plain;
  const sorted = Float32Array.from(lums).sort();
  const black = percentile(sorted, options.low);
  const white = percentile(sorted, options.high);
  const strength = smoothstep(options.flat, options.full, (white - black) / 255);
  if (strength === 0) return plain;
  const stretched = new Float32Array(lums.length);
  for (let i = 0; i < lums.length; i++) stretched[i] = clamp01((lums[i]! - black) / (white - black));
  const gamma = gammaForMean(stretched, options.mean, options.minGamma, options.maxGamma, options.toe);
  return { black, white, gamma, strength, toe: options.toe };
}

export function applyTone(lum: number, { black, white, gamma, strength, toe }: ToneCurve): number {
  const real = clamp01(lum / 255);
  if (strength === 0) return real;
  const stretched = clamp01((lum - black) / (white - black));
  return real + (shaped(stretched, gamma, toe) - real) * strength;
}

export function toneMap(lums: ArrayLike<number>, options: ToneOptions = TONE): Float32Array {
  const curve = toneCurve(lums, options);
  return Float32Array.from(lums, (lum) => applyTone(lum, curve));
}
