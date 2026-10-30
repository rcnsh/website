// Who may see and fetch what in the file bucket, decided per folder. Shared by
// the site and the upload.rcn.sh Worker, which must never disagree about it.

import { isHiddenKey, objectKey, THUMBS_PREFIX } from "./bucket-keys.ts";

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

/**
 * Everything up to the last slash, "" at the root: a key's folder, or a
 * folder prefix itself.
 */
export function prefixOf(key: string): string {
  return key.slice(0, key.lastIndexOf("/") + 1);
}

function parentFolder(prefix: string): string {
  return prefixOf(prefix.slice(0, -1));
}

/**
 * The setting that applies to a key or folder prefix: the nearest folder,
 * itself included, that has one of its own.
 */
export function visibilityOf(rules: VisibilityRules, path: string): Visibility {
  let prefix = path === "" || path.endsWith("/") ? path : prefixOf(path);
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

/**
 * The key whose visibility governs `key`: a preview under `.thumbs/` answers
 * to the file it was made from, any other dot path to nothing (null). Thumbs
 * of a private file would otherwise publish its frames.
 */
export function accessSubject(key: string): string | null {
  if (key.startsWith(THUMBS_PREFIX)) {
    const source = key.slice(THUMBS_PREFIX.length);
    return source && !isHiddenKey(source) ? source : null;
  }
  return isHiddenKey(key) ? null : key;
}

export type ReadRefusal = "bad-request" | "not-found" | "unavailable";

export type ReadDecision =
  | { ok: true; key: string; visibility: Visibility }
  | { ok: false; refusal: ReadRefusal; error?: unknown };

/**
 * Whether the object at `key` may be read, refusing in a fixed order: a key
 * that names nothing, then a dot path, then rules that cannot be read, then a
 * private file for anyone but the owner. Private and missing answer alike so
 * existence is never confirmed. `isOwner` is asked only about private files,
 * so a public read never costs a session lookup.
 */
export async function decideRead(
  raw: string | null | undefined,
  rules: () => Promise<VisibilityRules>,
  isOwner: () => Promise<boolean>,
): Promise<ReadDecision> {
  const key = objectKey(raw);
  if (key === null) return { ok: false, refusal: "bad-request" };
  const subject = accessSubject(key);
  if (subject === null) return { ok: false, refusal: "not-found" };

  let visibility: Visibility;
  try {
    visibility = visibilityOf(await rules(), subject);
  } catch (error) {
    return { ok: false, refusal: "unavailable", error };
  }

  if (visibility === "private" && !(await isOwner())) return { ok: false, refusal: "not-found" };
  return { ok: true, key, visibility };
}

/** How long an isolate trusts its copy of the rules; a change lands everywhere within this. */
export const RULES_FRESH_MS = 10_000;

export type RuleRow = { prefix: string; visibility: string };

/**
 * The rules, read through `read` and memoised for RULES_FRESH_MS. A failed
 * read throws rather than returning `{}`: empty rules would apply the default
 * to every folder, and a caller that cannot read the rules must refuse.
 * `forget` drops the memo, for the isolate that just wrote a change.
 */
export function rulesLoader(read: () => Promise<Iterable<RuleRow>>, now: () => number = Date.now) {
  let memo: { rules: VisibilityRules; at: number } | null = null;

  async function load(): Promise<VisibilityRules> {
    if (memo && now() - memo.at < RULES_FRESH_MS) return memo.rules;
    const rules = parseRules(await read());
    memo = { rules, at: now() };
    return rules;
  }

  function forget(): void {
    memo = null;
  }

  return { load, forget };
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
