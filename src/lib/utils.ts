import { clsx, type ClassValue } from "clsx";

/**
 * Joins class names. Plain clsx: tailwind-merge resolves conflicts between a
 * component's own classes and ones handed to it from outside, and nothing here
 * takes a className prop — every call site owns both sides of the conditional.
 * Reach for it again the day a component starts accepting one.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${UNITS[i]}`;
}

export function formatDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const RELATIVE_STEPS: [limit: number, div: number, unit: Intl.RelativeTimeFormatUnit][] =
  [
    [60, 1, "second"],
    [3600, 60, "minute"],
    [86400, 3600, "hour"],
    [604800, 86400, "day"],
    [2629800, 604800, "week"],
    [31557600, 2629800, "month"],
    [Infinity, 31557600, "year"],
  ];

export function relativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const seconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

  for (const [limit, div, unit] of RELATIVE_STEPS) {
    if (abs < limit) return formatter.format(Math.round(seconds / div), unit);
  }
  return formatDate(date);
}

const WORDS_PER_MINUTE = 200;

/**
 * Deliberately rough. Fenced and inline code are dropped rather than counted at
 * prose speed, and what's left is counted as whitespace-separated tokens.
 *
 * Lives here rather than in lib/blog.ts so the share-card script can import it
 * without dragging in `astro:content`, which only resolves inside Astro.
 */
export function readingTime(body = ""): number {
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Human-readable file-type bucket, used for icons and colour in the browser. */
export function fileKind(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(ext))
    return "image" as const;
  if (["mp4", "mkv", "mov", "webm", "avi", "m4v"].includes(ext)) return "video" as const;
  if (["mp3", "flac", "wav", "ogg", "m4a", "opus"].includes(ext)) return "audio" as const;
  if (["zip", "tar", "gz", "xz", "7z", "rar", "bz2", "zst"].includes(ext))
    return "archive" as const;
  if (["pdf", "doc", "docx", "odt", "epub"].includes(ext)) return "doc" as const;
  if (
    ["ts", "tsx", "js", "jsx", "py", "rs", "go", "c", "h", "cpp", "sh", "json", "yml", "yaml", "toml", "lua", "java"].includes(ext)
  )
    return "code" as const;
  if (["txt", "md", "log", "csv"].includes(ext)) return "text" as const;
  return "file" as const;
}
