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

export type Stored = {
  size: number;
  httpEtag: string;
  uploaded: Date;
  range?: ByteRange;
  writeHttpMetadata(headers: Headers): void;
};

export type StoredBody = Stored & { body: ReadableStream };

export type ReadableBucket = {
  head(key: string): Promise<Stored | null>;
  get(key: string, options: { range?: Headers; onlyIf: Headers }): Promise<Stored | StoredBody | null>;
};

export type BucketRead =
  | { kind: "missing" }
  | { kind: "unsatisfiable"; contentRange: string }
  | { kind: "not-modified"; object: Stored }
  | { kind: "precondition-failed"; object: Stored }
  | { kind: "full"; object: StoredBody }
  | { kind: "partial"; object: StoredBody; span: Span };

export function ifRangeHolds(ifRange: string | null, object: { httpEtag: string }): boolean {
  return ifRange === null || ifRange.trim() === object.httpEtag;
}

function unconditional(object: Stored | StoredBody, request: Headers): BucketRead | null {
  if ("body" in object) return null;
  const notModified = request.has("if-none-match") || request.has("if-modified-since");
  return { kind: notModified ? "not-modified" : "precondition-failed", object };
}

async function whole(bucket: ReadableBucket, key: string, request: Headers): Promise<BucketRead> {
  const object = await bucket.get(key, { onlyIf: request });
  if (!object) return { kind: "missing" };
  return unconditional(object, request) ?? { kind: "full", object: object as StoredBody };
}

export async function readObject(bucket: ReadableBucket, key: string, request: Headers): Promise<BucketRead> {
  const range = request.get("range");
  const ifRange = request.get("if-range");
  const asked = rangeToAsk(range);
  let object: Stored | StoredBody | null;
  try {
    object = await bucket.get(key, { ...(asked ? { range: asked } : {}), onlyIf: request });
  } catch (error) {
    if (!asked || !isRangeError(error)) throw error;
    const read = await whole(bucket, key, request);
    if (read.kind !== "full" || !ifRangeHolds(ifRange, read.object)) return read;
    await read.object.body.cancel();
    return { kind: "unsatisfiable", contentRange: `bytes */${read.object.size}` };
  }
  if (!object) return { kind: "missing" };
  const refused = unconditional(object, request);
  if (refused) return refused;
  const body = object as StoredBody;

  if (range && !ifRangeHolds(ifRange, body)) {
    if (!asked) return { kind: "full", object: body };
    await body.body.cancel();
    return whole(bucket, key, request);
  }

  const outcome = rangeOutcome(range, body);
  if (outcome.kind === "unsatisfiable") {
    await body.body.cancel();
    return outcome;
  }
  return outcome.kind === "partial" ? { kind: "partial", object: body, span: outcome.span } : { kind: "full", object: body };
}
