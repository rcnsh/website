// What a bucket key or folder prefix may look like, for the site, the browser
// and the upload.rcn.sh Worker alike.

/** Previews of `<key>` live at `.thumbs/<key>.<kind>`. */
export const THUMBS_PREFIX = ".thumbs/";

/** Dot-prefixed entries stay hidden, the same way `ls` hides them. */
export function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/** Hidden anywhere along the path, so `.thumbs/x.png` counts. */
export function isHiddenKey(key: string): boolean {
  return key.split("/").some(isHidden);
}

function traverses(path: string): boolean {
  return path.split("/").includes("..");
}

/**
 * `raw` when it can name an object, else null: not empty, not a folder, no
 * `..` segment. Whether it is hidden or readable is decided separately.
 */
export function objectKey(raw: string | null | undefined): string | null {
  if (!raw || raw.endsWith("/") || traverses(raw)) return null;
  return raw;
}

/**
 * A folder prefix ("" for the root, otherwise ending in "/"), with leading and
 * doubled slashes dropped. Null for traversal or a hidden folder, never the
 * root: a caller that falls back to "" would silently retarget the root.
 */
export function folderPrefix(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!cleaned) return "";
  if (traverses(cleaned) || isHiddenKey(cleaned)) return null;
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}
