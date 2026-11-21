import { isHiddenKey, objectKey, THUMBS_PREFIX } from "./bucket-keys.ts";

export type Visibility = "listed" | "unlisted" | "private";

export const VISIBILITIES: readonly Visibility[] = ["listed", "unlisted", "private"];

export type VisibilityRules = Record<string, Visibility>;

export const DEFAULT_VISIBILITY: Visibility = "unlisted";

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

export function parseRules(rows: Iterable<{ prefix: string; visibility: string }>): VisibilityRules {
  const rules: VisibilityRules = {};
  for (const { prefix, visibility } of rows) {
    rules[prefix] = isVisibility(visibility) ? visibility : "private";
  }
  return rules;
}

export function prefixOf(key: string): string {
  return key.slice(0, key.lastIndexOf("/") + 1);
}

function parentFolder(prefix: string): string {
  return prefixOf(prefix.slice(0, -1));
}

export function visibilityOf(rules: VisibilityRules, path: string): Visibility {
  let prefix = path === "" || path.endsWith("/") ? path : prefixOf(path);
  for (;;) {
    if (Object.hasOwn(rules, prefix)) return rules[prefix];
    if (prefix === "") return DEFAULT_VISIBILITY;
    prefix = parentFolder(prefix);
  }
}

export function inheritedFrom(rules: VisibilityRules, prefix: string): string | null {
  if (Object.hasOwn(rules, prefix)) return null;
  let at = prefix;
  while (at !== "") {
    at = parentFolder(at);
    if (Object.hasOwn(rules, at)) return at;
  }
  return "";
}

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

export const RULES_FRESH_MS = 10_000;

export type RuleRow = { prefix: string; visibility: string };

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

export function rulesVersion(rules: VisibilityRules): string {
  const canonical = JSON.stringify(Object.entries(rules).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
