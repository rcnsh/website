export function cssPixels(value: string, rootFontPx: number): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === "rem" ? n * rootFontPx : n;
}
