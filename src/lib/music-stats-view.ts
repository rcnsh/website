const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function splitMonth(value: string): { year: string; month: string } {
  const [year = "", m = "1"] = value.split("-");
  return { year, month: MONTHS[Number(m) - 1] ?? "" };
}

export function monthLabel(value: string): string {
  const { year, month } = splitMonth(value);
  return `${month} ${year}`;
}

export function monthRange(from: string, to: string): string {
  if (from === to) return monthLabel(from);
  const a = splitMonth(from);
  const b = splitMonth(to);
  return a.year === b.year ? `${a.month}–${b.month} ${b.year}` : `${monthLabel(from)} – ${monthLabel(to)}`;
}

export function quarterLabel(period: string): string {
  const [year, quarter] = period.split("-");
  return `${quarter} ${year}`;
}

export function percent(share: number): string {
  const value = share * 100;
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n.toLocaleString("en-GB")}${suffix}`;
}

export function spotifyUrl(kind: "track" | "artist", id: string | null | undefined): string | null {
  if (!id || id.startsWith("name:")) return null;
  return `https://open.spotify.com/${kind}/${id}`;
}

export function cover(url: string | null, size: 64 | 300): string | null {
  if (!url) return null;
  const rendition = size === 64 ? "ab67616d00004851" : "ab67616d00001e02";
  return url.replace("ab67616d0000b273", rendition);
}

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

export function heatLevel(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.sqrt(Math.min(value, max) / max);
}

export function niceShareMax(value: number): number {
  return Math.max(0.05, Math.ceil(value / 0.05) * 0.05);
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function peakHour(shares: number[]): number {
  let best = 0;
  shares.forEach((value, hour) => {
    if (value > (shares[best] ?? 0)) best = hour;
  });
  return best;
}

export function shareBetween(shares: number[], from: number, to: number): number {
  let sum = 0;
  for (let h = from; h !== to; h = (h + 1) % 24) sum += shares[h] ?? 0;
  return sum;
}

export const ERA_STYLE = {
  newcastle: { colour: "var(--color-brand)", dash: undefined },
  singapore: { colour: "#c08050", dash: "6 4" },
} as const satisfies Record<string, { colour: string; dash: string | undefined }>;

export function eraStyle(key: string): { colour: string; dash: string | undefined } {
  return Object.hasOwn(ERA_STYLE, key) ? ERA_STYLE[key as keyof typeof ERA_STYLE] : { colour: "var(--color-ink-dim)", dash: undefined };
}

export const FIRST_STATS_YEAR = 2020;

export function statsYears(now: Date): string[] {
  const years: string[] = [];
  for (let y = FIRST_STATS_YEAR; y <= now.getUTCFullYear(); y++) years.push(String(y));
  return years;
}


export function newYears(offered: readonly string[], rendered: Iterable<string>): string[] {
  const latest = Math.max(FIRST_STATS_YEAR - 1, ...offered.map(Number).filter(Number.isInteger));
  const found = new Set<string>();
  for (const value of rendered) if (/^\d{4}$/.test(value) && Number(value) > latest) found.add(value);
  return [...found].sort();
}
