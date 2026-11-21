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
  const match = range?.match(/^bytes=(\d+)-\d*$/);
  return match !== null && match !== undefined && Number(match[1]) >= size;
}
