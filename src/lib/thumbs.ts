import { isHiddenKey, objectKey, THUMBS_PREFIX } from "../../shared/bucket-keys.ts";

export const DOWNLOAD_PATH = "/api/files/download";

export function publicUrl(base: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return base
    ? `${base}/${encoded}`
    : `${DOWNLOAD_PATH}?key=${encodeURIComponent(key)}`;
}

const MAX_SOURCE_KEY_BYTES = 1024 - THUMBS_PREFIX.length - ".strip.webp".length - 8;

export function isVisibleKey(key: string): boolean {
  if (objectKey(key) === null || key.startsWith("/")) return false;
  if (new TextEncoder().encode(key).byteLength > MAX_SOURCE_KEY_BYTES) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === ".")) return false;
  return !isHiddenKey(key);
}

export const THUMB_KINDS = {
  "poster.webp": { type: "image/webp", maxBytes: 512 * 1024 },
  "strip.webp": { type: "image/webp", maxBytes: 2 * 1024 * 1024 },
  "strip.json": { type: "application/json", maxBytes: 16 * 1024 },
  "peaks.json": { type: "application/json", maxBytes: 64 * 1024 },
} as const;

export type ThumbKind = keyof typeof THUMB_KINDS;

export function isThumbKind(name: string): name is ThumbKind {
  return Object.hasOwn(THUMB_KINDS, name);
}

export const MAX_THUMBS_REQUEST_BYTES =
  Object.values(THUMB_KINDS).reduce((sum, { maxBytes }) => sum + maxBytes, 0) +
  64 * 1024;

export function thumbKey(sourceKey: string, kind: ThumbKind): string | null {
  if (!isVisibleKey(sourceKey)) return null;
  return `${THUMBS_PREFIX}${sourceKey}.${kind}`;
}

export const SOURCE_UPLOADED_FIELD = "source-uploaded";

export type ThumbSet = { poster: boolean; strip: boolean; peaks: boolean };

export const NO_THUMBS: ThumbSet = { poster: false, strip: false, peaks: false };

export function thumbSet(kinds: Iterable<string>): ThumbSet {
  const have = new Set(kinds);
  return {
    poster: have.has("poster.webp"),
    strip: have.has("strip.webp") && have.has("strip.json"),
    peaks: have.has("peaks.json"),
  };
}

function isWebp(bytes: Uint8Array): boolean {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  return bytes.byteLength >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

export function thumbPartProblem(
  kind: ThumbKind,
  declaredType: string,
  bytes: Uint8Array,
): string | null {
  const rule = THUMB_KINDS[kind];
  if (declaredType.split(";")[0].trim().toLowerCase() !== rule.type) {
    return `${kind} must be ${rule.type}`;
  }
  if (bytes.byteLength === 0) return `${kind} is empty`;
  if (bytes.byteLength > rule.maxBytes) return `${kind} is over ${rule.maxBytes} bytes`;

  if (rule.type === "image/webp") {
    return isWebp(bytes) ? null : `${kind} is not a WebP image`;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? null
      : `${kind} must be a JSON object`;
  } catch {
    return `${kind} is not valid JSON`;
  }
}

export type StripSidecar = {
  version: 1;
  frames: number;
  columns: number;
  tileWidth: number;
  tileHeight: number;
  timestamps: number[];
};

export type PeaksSidecar = {
  version: 1;
  duration: number;
  peaks: number[];
};

const isCount = (v: unknown, max: number): v is number =>
  Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;

export function parseStripSidecar(value: unknown): StripSidecar | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<StripSidecar>;
  if (v.version !== 1) return null;
  if (!isCount(v.frames, 256) || !isCount(v.columns, 256)) return null;
  if (!isCount(v.tileWidth, 4096) || !isCount(v.tileHeight, 4096)) return null;
  if (!Array.isArray(v.timestamps) || v.timestamps.length !== v.frames) return null;
  if (!v.timestamps.every((t) => typeof t === "number" && Number.isFinite(t))) return null;
  return v as StripSidecar;
}

export function parsePeaksSidecar(value: unknown): PeaksSidecar | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<PeaksSidecar>;
  if (v.version !== 1 || typeof v.duration !== "number" || !(v.duration > 0)) return null;
  if (!Array.isArray(v.peaks) || v.peaks.length === 0 || v.peaks.length > 10_000) return null;
  if (!v.peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) return null;
  return v as PeaksSidecar;
}
