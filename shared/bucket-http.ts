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

const LARGEST_OBJECT = 2 ** 43;

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/i;

type RangeParts = { first: number | null; last: number | null };

function rangeParts(range: string | null): RangeParts | null {
  const match = range?.trim().match(SINGLE_RANGE);
  if (!match) return null;
  const [rawFirst, rawLast] = [match[1], match[2]];
  if (rawFirst === "" && rawLast === "") return null;
  if (rawFirst !== "" && rawLast !== "" && BigInt(rawLast) < BigInt(rawFirst)) return null;
  const read = (part: string) => (part === "" ? null : Math.min(Number(part), LARGEST_OBJECT));
  const first = rawFirst !== "" && BigInt(rawFirst) >= BigInt(LARGEST_OBJECT) ? Number.POSITIVE_INFINITY : read(rawFirst);
  if (first === Number.POSITIVE_INFINITY) return { first, last: null };
  let last = read(rawLast);
  if (first !== null && last === LARGEST_OBJECT) last = null;
  if (first !== null && last !== null && last < first) return null;
  return { first, last };
}

export function rangeToAsk(range: string | null): Headers | undefined {
  const parts = rangeParts(range);
  if (!parts || (parts.first === null && parts.last === 0) || parts.first === Number.POSITIVE_INFINITY) return undefined;
  return new Headers({ range: `bytes=${parts.first ?? ""}-${parts.last ?? ""}` });
}

export function unsatisfiable(range: string | null, size: number): boolean {
  const parts = rangeParts(range);
  if (!parts) return false;
  if (parts.first === null) return parts.last === 0 || size === 0;
  return parts.first >= size;
}

export function isRangeError(error: unknown): boolean {
  return /\(10039\)|not satisfiable/i.test(error instanceof Error ? error.message : String(error));
}

export type ByteRange = { offset?: number; length?: number; suffix?: number };

export type Span = { offset: number; length: number };

export function span(object: { size: number; range?: ByteRange }): Span | null {
  const range = object.range;
  if (!range) return null;
  if (typeof range.suffix === "number") {
    const length = Math.min(range.suffix, object.size);
    return length > 0 ? { offset: object.size - length, length } : null;
  }
  const offset = range.offset ?? 0;
  const length = Math.min(range.length ?? object.size - offset, object.size - offset);
  return length > 0 ? { offset, length } : null;
}

export type RangeOutcome =
  | { kind: "full" }
  | { kind: "partial"; span: Span }
  | { kind: "unsatisfiable"; contentRange: string };

export function rangeOutcome(range: string | null, object: { size: number; range?: ByteRange }): RangeOutcome {
  const refused = { kind: "unsatisfiable", contentRange: `bytes */${object.size}` } as const;
  if (!range) return { kind: "full" };
  if (unsatisfiable(range, object.size)) return refused;
  const served = span(object);
  if (served) return { kind: "partial", span: served };
  return object.range ? refused : { kind: "full" };
}

export function contentRange({ offset, length }: Span, size: number): string {
  return `bytes ${offset}-${offset + length - 1}/${size}`;
}
