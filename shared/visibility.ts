// Who may see and fetch what in the file bucket, decided per folder. Shared by
// the site and the upload.rcn.sh Worker, which must never disagree about it.

/**
 * `listed` shows on /files. `unlisted` is hidden there but still served to
 * anyone holding the URL. `private` is served only to the owner, through the
 * site's download route.
 */
export type Visibility = "listed" | "unlisted" | "private";

export const VISIBILITIES: readonly Visibility[] = ["listed", "unlisted", "private"];

/** Folder prefix ("" for the root, otherwise ending in "/") to its own setting. */
export type VisibilityRules = Record<string, Visibility>;

/** What a folder gets when neither it nor any ancestor has a setting. */
export const DEFAULT_VISIBILITY: Visibility = "unlisted";

const THUMBS_PREFIX = ".thumbs/";

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

/**
 * Rows as stored. A value this code does not recognise is read as `private`:
 * a typo in the table must hide a folder, never expose one.
 */
export function parseRules(rows: Iterable<{ prefix: string; visibility: string }>): VisibilityRules {
  const rules: VisibilityRules = {};
  for (const { prefix, visibility } of rows) {
    rules[prefix] = isVisibility(visibility) ? visibility : "private";
  }
  return rules;
}

/** The folder a key lives in: everything up to the last slash, "" at the root. */
export function folderOf(key: string): string {
  return key.slice(0, key.lastIndexOf("/") + 1);
}

function parentFolder(prefix: string): string {
  return folderOf(prefix.slice(0, -1));
}

/**
 * The setting that applies to a key or folder prefix: the nearest folder,
 * itself included, that has one of its own.
 */
export function visibilityOf(rules: VisibilityRules, path: string): Visibility {
  let prefix = path === "" || path.endsWith("/") ? path : folderOf(path);
  for (;;) {
    // hasOwn, not `in`: a folder called "constructor/" is not Object's.
    if (Object.hasOwn(rules, prefix)) return rules[prefix];
    if (prefix === "") return DEFAULT_VISIBILITY;
    prefix = parentFolder(prefix);
  }
}

/** The folder whose setting is inherited, or null when the path has its own. */
export function inheritedFrom(rules: VisibilityRules, prefix: string): string | null {
  if (Object.hasOwn(rules, prefix)) return null;
  let at = prefix;
  while (at !== "") {
    at = parentFolder(at);
    if (Object.hasOwn(rules, at)) return at;
  }
  return "";
}

function hidden(key: string): boolean {
  return key.split("/").some((segment) => segment.startsWith("."));
}

/**
 * The key whose visibility governs `key`: a preview under `.thumbs/` answers
 * to the file it was made from, any other dot path to nothing (null). Thumbs
 * of a private file would otherwise publish its frames.
 */
export function accessSubject(key: string): string | null {
  if (key.startsWith(THUMBS_PREFIX)) {
    const source = key.slice(THUMBS_PREFIX.length);
    return source && !hidden(source) ? source : null;
  }
  return hidden(key) ? null : key;
}

/** Whether anyone, signed in or not, may fetch the object at `key`. */
export function servesPublicly(rules: VisibilityRules, key: string): boolean {
  const subject = accessSubject(key);
  return subject !== null && visibilityOf(rules, subject) !== "private";
}

/**
 * A short fingerprint of the rules, for cache keys: any change to them yields
 * a new one, so nothing cached under the old rules is served under the new.
 */
export function rulesVersion(rules: VisibilityRules): string {
  const canonical = JSON.stringify(Object.entries(rules).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  // FNV-1a: not for secrecy, just a stable short tag.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
