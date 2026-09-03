import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { cached } from "./cache";
import { getDb, schema } from "./db";

/**
 * Reading the guestbook.
 *
 * The page used to select the latest 200 rows on every request, uncached, on a
 * route the Worker renders for anyone who asks. Two things were wrong with
 * that. The obvious one is that most of those rows were never looked at — the
 * list sits below a map and nobody scrolls to the bottom of it. The one that
 * matters is that D1 bills rows read, the allowance is a daily one, and 200
 * rows a view means a few minutes of scripted traffic exhausts it for the
 * whole database — taking sessions, and therefore signing in, down with it.
 *
 * So the list is paginated and the first page is cached. A visitor who reads
 * the top of the page costs a KV read; one who scrolls pays a page at a time.
 */

/** Rows per page. Roughly two screens on a phone. */
export const PAGE_SIZE = 25;

/** How long the first page and the totals are served before a refresh runs. */
const FRESH_SECONDS = 60;

const FIRST_PAGE_KEY = "guestbook:page:1";
const STATS_KEY = "guestbook:stats";

/**
 * One entry, in the shape that survives a trip through JSON.
 *
 * `createdAt` is epoch seconds rather than a Date because these go into KV and
 * come back out of `fetch`, and a Date survives neither. The browser needs a
 * number to format anyway.
 */
export type GuestbookEntry = {
  id: number;
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  message: string;
  createdAt: number;
};

/**
 * A cursor is the sort key of the last row handed out: newest first by time,
 * with the id breaking ties.
 *
 * Not an offset. Rows are inserted while people are reading, and an offset
 * would show one entry twice and skip another the moment anything was signed
 * between two pages. Not the id alone either — migration 0002 imported the old
 * guestbook with backdated timestamps, so id order and time order are not the
 * same order, and paginating on the wrong one silently strands those entries.
 */
export type Cursor = { createdAt: number; id: number };

export type GuestbookPage = {
  entries: GuestbookEntry[];
  /** Where the next page starts, or null when this was the last one. */
  next: Cursor | null;
};

/** Signature totals, for the map and the heading above the list. */
export type GuestbookStats = {
  total: number;
  /** ISO 3166-1 alpha-2 to signature count. */
  counts: Record<string, number>;
  /** Signatures with no usable country — imported, or Workers didn't say. */
  unplaced: number;
};

/** `<epoch seconds>:<id>`, which is what travels in the query string. */
export function encodeCursor(cursor: Cursor): string {
  return `${cursor.createdAt}:${cursor.id}`;
}

/**
 * Parses a cursor, or null for anything that is not one.
 *
 * Strict, because it arrives from a stranger and becomes two numbers in a
 * WHERE clause. Non-negative integers only; nothing else is a position in this
 * list, and a malformed cursor should start from the top rather than error.
 */
export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;

  const match = /^(\d{1,15}):(\d{1,15})$/.exec(raw);
  if (!match) return null;

  return { createdAt: Number(match[1]), id: Number(match[2]) };
}

function toEntry(row: typeof schema.guestbook.$inferSelect): GuestbookEntry {
  return {
    id: row.id,
    githubId: row.githubId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    message: row.message,
    createdAt: Math.floor(row.createdAt.getTime() / 1000),
  };
}

/** Reads one page straight from D1. */
async function readPage(after: Cursor | null): Promise<GuestbookPage> {
  const db = getDb();
  const at = after ? new Date(after.createdAt * 1000) : null;

  /*
    One row more than the page, so "is there another page" is answered by the
    query that fetched this one rather than by a second COUNT.
  */
  const rows = await db
    .select()
    .from(schema.guestbook)
    .where(
      after && at
        ? or(
            lt(schema.guestbook.createdAt, at),
            and(
              eq(schema.guestbook.createdAt, at),
              lt(schema.guestbook.id, after.id),
            ),
          )
        : undefined,
    )
    .orderBy(desc(schema.guestbook.createdAt), desc(schema.guestbook.id))
    .limit(PAGE_SIZE + 1);

  const entries = rows.slice(0, PAGE_SIZE).map(toEntry);
  const last = entries.at(-1);

  return {
    entries,
    next:
      rows.length > PAGE_SIZE && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

/**
 * A page of entries.
 *
 * Only the first page goes through KV. Every visitor lands on it, so it is the
 * one worth collapsing into a single read; deeper pages are asked for by
 * people who are actually scrolling, and caching them would mean a KV entry
 * per cursor — a set the caller picks from, not one this code controls.
 */
export async function getPage(after: Cursor | null = null): Promise<GuestbookPage> {
  if (after) return readPage(after);
  return cached(FIRST_PAGE_KEY, FRESH_SECONDS, () => readPage(null));
}

/** Totals for the map and the heading, in one grouped pass. */
export async function getStats(): Promise<GuestbookStats> {
  return cached(STATS_KEY, FRESH_SECONDS, async () => {
    const rows = await getDb()
      .select({ country: schema.guestbook.country, n: count() })
      .from(schema.guestbook)
      .groupBy(schema.guestbook.country);

    const stats: GuestbookStats = { total: 0, counts: {}, unplaced: 0 };

    for (const row of rows) {
      stats.total += row.n;
      // `T1` is Tor's placeholder and the imported rows have no country at
      // all. The map treats both the same — not placed.
      if (row.country && row.country !== "T1" && /^[A-Z]{2}$/.test(row.country)) {
        stats.counts[row.country] = (stats.counts[row.country] ?? 0) + row.n;
      } else {
        stats.unplaced += row.n;
      }
    }

    return stats;
  });
}

/**
 * Drops the cached first page and totals.
 *
 * Called after a signature is added or removed, so the writer sees their own
 * change on the redirect that follows rather than up to a minute later. Both
 * keys go together: a new entry moves the list and the totals at once, and
 * half-fresh is worse than either.
 *
 * Failures are swallowed. The write is already committed, the cache expires on
 * its own within the minute, and a stale list is not worth a 500 over.
 */
export async function invalidate(): Promise<void> {
  const kv = env.CACHE;
  if (!kv) return;

  try {
    await Promise.all([kv.delete(FIRST_PAGE_KEY), kv.delete(STATS_KEY)]);
  } catch (error) {
    console.error("[guestbook] cache invalidation failed", error);
  }
}

/**
 * When this signer last posted, for the rate limit.
 *
 * Its own query rather than a scan of the rendered page: the list is 25 rows
 * now and the signer's last message is very often not among them. Covered by
 * the (github_id, created_at) index, so it reads one row.
 */
export async function lastPostedAt(githubId: number): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: schema.guestbook.createdAt })
    .from(schema.guestbook)
    .where(eq(schema.guestbook.githubId, githubId))
    .orderBy(desc(schema.guestbook.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}
