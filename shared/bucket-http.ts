// HTTP details of serving the bucket on its own domain (workers/upload),
// matching what R2's public custom domain did before the Worker replaced it.

import { objectKey } from "./bucket-keys.ts";

/** The object key a request path names, or null when it names none. */
export function keyFromPath(pathname: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  return objectKey(key);
}

/** Comma-separated config, as a wrangler var can hold it. */
export function parseOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * CORS for an allowed origin, else none. The site reads ranges of media and
 * text from the bucket, so Range must be sendable and Content-Range readable.
 */
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

/**
 * Whether a Range header asks only for bytes past the end, which R2's public
 * domain answers with 416. R2's binding instead returns the whole object.
 */
export function unsatisfiable(range: string | null, size: number): boolean {
  const match = range?.match(/^bytes=(\d+)-\d*$/);
  return match !== null && match !== undefined && Number(match[1]) >= size;
}
