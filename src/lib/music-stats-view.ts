/**
 * Formatting and chart geometry for /music/stats. Dependency-free so it can be
 * tested under node; the components only lay out what these return.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function splitMonth(value: string): { year: string; month: string } {
  const [year = "", m = "1"] = value.split("-");
  return { year, month: MONTHS[Number(m) - 1] ?? "" };
}

/** "2024-08" → "Aug 2024". */
export function monthLabel(value: string): string {
  const { year, month } = splitMonth(value);
  return `${month} ${year}`;
}

/** A span of months, dropping whatever the two ends share. */
export function monthRange(from: string, to: string): string {
  if (from === to) return monthLabel(from);
  const a = splitMonth(from);
  const b = splitMonth(to);
  return a.year === b.year ? `${a.month}–${b.month} ${b.year}` : `${monthLabel(from)} – ${monthLabel(to)}`;
}

/** "2025-Q2" → "Q2 2025". */
export function quarterLabel(period: string): string {
  const [year, quarter] = period.split("-");
  return `${quarter} ${year}`;
}

/** 0.1234 → "12%"; small shares keep a decimal so they don't all read "0%". */
export function percent(share: number): string {
  const value = share * 100;
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Spotify album art comes from the warehouse at 640px. The CDN serves the
 * same image at 300px and 64px under a different prefix, so swap rather than
 * ship ten times the bytes for a 36px thumbnail. An unrecognised URL passes
 * through unchanged — the prefix is a CDN convention, not an API.
 */
export function cover(url: string | null, size: 64 | 300): string | null {
  if (!url) return null;
  const rendition = size === 64 ? "ab67616d00004851" : "ab67616d00001e02";
  return url.replace("ab67616d0000b273", rendition);
}

/**
 * An SVG polyline path through evenly spaced values, drawn within a
 * `width` × `height` box with the baseline at the bottom.
 */
export function linePath(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - (max > 0 ? (value / max) * height : 0)).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

/**
 * 0–1 intensity for a heatmap cell. Square root, so the quiet small hours
 * stay distinguishable from nothing at all instead of washing out next to a
 * busy afternoon.
 */
export function heatLevel(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.sqrt(Math.min(value, max) / max);
}

/** A tidy axis maximum at or above `value`, as a share (0.05 steps). */
export function niceShareMax(value: number): number {
  return Math.max(0.05, Math.ceil(value / 0.05) * 0.05);
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "16:00" for hour 16. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Where along a 24-hour profile listening peaks. */
export function peakHour(shares: number[]): number {
  let best = 0;
  shares.forEach((value, hour) => {
    if (value > (shares[best] ?? 0)) best = hour;
  });
  return best;
}

/** Share of a profile falling between two hours, `from` inclusive, wrapping midnight. */
export function shareBetween(shares: number[], from: number, to: number): number {
  let sum = 0;
  for (let h = from; h !== to; h = (h + 1) % 24) sum += shares[h] ?? 0;
  return sum;
}

/** The first calendar year with listening history worth showing. */
export const FIRST_STATS_YEAR = 2020;

/** Every year the page's switch offers, oldest first. */
export function statsYears(now: Date): string[] {
  const years: string[] = [];
  for (let y = FIRST_STATS_YEAR; y <= now.getUTCFullYear(); y++) years.push(String(y));
  return years;
}

