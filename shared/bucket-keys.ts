export const THUMBS_PREFIX = ".thumbs/";

export function isHidden(name: string): boolean {
  return name.startsWith(".");
}

export function isHiddenKey(key: string): boolean {
  return key.split("/").some(isHidden);
}

function traverses(path: string): boolean {
  return path.split("/").includes("..");
}

export function objectKey(raw: string | null | undefined): string | null {
  if (!raw || raw.endsWith("/") || traverses(raw)) return null;
  return raw;
}

export function folderPrefix(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!cleaned) return "";
  if (traverses(cleaned) || isHiddenKey(cleaned)) return null;
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}
