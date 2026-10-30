/**
 * Where the guestbook is cached. Free of D1 and `cloudflare:workers` so it
 * runs under `node --test`.
 */

/** How long the first page and the totals are served before a refresh runs. */
export const FRESH_SECONDS = 60;

export const FIRST_PAGE_KEY = "guestbook:page:1";
export const STATS_KEY = "guestbook:stats";

/** The Cache API name behind `/api/guestbook/list`. */
export const LIST_CACHE = "guestbook-list";

/**
 * Sort key of the last row handed out: newest first, id breaking ties. Not the
 * id alone — migration 0002 backdated the imported entries, so id order and
 * time order differ and paginating on the wrong one strands them.
 */
export type Cursor = { createdAt: number; id: number };

/** `<epoch seconds>:<id>`, which is what travels in the query string. */
export function encodeCursor(cursor: Cursor): string {
  return `${cursor.createdAt}:${cursor.id}`;
}

/**
 * Parses a cursor, or null. Strict — it arrives from a stranger and becomes
 * two numbers in a WHERE clause. A malformed one starts from the top.
 */
export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;

  const match = /^(\d{1,15}):(\d{1,15})$/.exec(raw);
  if (!match) return null;

  return { createdAt: Number(match[1]), id: Number(match[2]) };
}

/**
 * The edge key for a page. Built from the re-encoded cursor, not the raw
 * parameter, so junk collapses onto the page-1 key instead of minting an entry
 * per garbage string.
 */
export function listUrl(origin: string, after: Cursor | null): string {
  return `${origin}/api/guestbook/list${after ? `?after=${encodeURIComponent(encodeCursor(after))}` : ""}`;
}
