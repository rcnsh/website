import { objectKey } from "./bucket-keys.ts";

export function keyFromPath(pathname: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  return objectKey(key);
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "Content-Range,Content-Length,Accept-Ranges,ETag",
  };
}

export const PREFLIGHT_HEADERS: Record<string, string> = {
  "access-control-allow-methods": "GET, HEAD",
  "access-control-allow-headers": "range",
  "access-control-max-age": "86400",
};

export function unsatisfiable(range: string | null, size: number): boolean {
  if (range && /^bytes=-0+$/.test(range)) return true;
  const match = range?.match(/^bytes=(\d+)-\d*$/);
  return match !== null && match !== undefined && Number(match[1]) >= size;
}

export function isRangeError(error: unknown): boolean {
  return /range/i.test(error instanceof Error ? error.message : String(error));
}

export type ByteRange = { offset?: number; length?: number; suffix?: number };

export type Span = { offset: number; length: number };

export function span(object: { size: number; range?: ByteRange }): Span | null {
  const range = object.range;
  if (!range) return null;
  if (typeof range.suffix === "number") {
    const length = Math.min(range.suffix, object.size);
    return { offset: object.size - length, length };
  }
  const offset = range.offset ?? 0;
  return { offset, length: Math.min(range.length ?? object.size - offset, object.size - offset) };
}

export function contentRange({ offset, length }: Span, size: number): string {
  return `bytes ${offset}-${offset + length - 1}/${size}`;
}
