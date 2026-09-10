import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { cached } from "./cache";
import { getDb, schema } from "./db";

/**
 * Reading the guestbook. Paginated with the first page cached: D1 bills rows
 * read against a daily allowance, so an uncached 200-row select per view is a
 * few minutes of scripted traffic away from taking sessions down with it.
 */

/** Rows per page. Roughly two screens on a phone. */
export const PAGE_SIZE = 25;

/** How long the first page and the totals are served before a refresh runs. */
const FRESH_SECONDS = 60;

const FIRST_PAGE_KEY = "guestbook:page:1";
const STATS_KEY = "guestbook:stats";

/** One entry. `createdAt` is epoch seconds, since a Date survives neither KV nor fetch. */
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
 * The sort key of the last row handed out: newest first, id breaking ties.
 *
 * Not an offset — rows are inserted while people read. Not the id alone
 * either: migration 0002 backdated the imported entries, so id order and time
 * order differ, and paginating on the wrong one strands them.
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
 * Parses a cursor, or null. Strict — it arrives from a stranger and becomes
 * two numbers in a WHERE clause. A malformed one starts from the top.
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

  // One row over the page, so "is there another" needs no second COUNT.
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
 * A page of entries. Only the first goes through KV — every visitor lands on
 * it, and caching deeper ones would mean a KV entry per caller-chosen cursor.
 */
export async function getPage(after: Cursor | null = null): Promise<GuestbookPage> {
  if (after) return readPage(after);
  return cached(FIRST_PAGE_KEY, FRESH_SECONDS, () => readPage(null));
}

/**
 * Below this many signatures, a country is folded into `unplaced` rather than
 * published.
 *
 * The histogram is public and the guestbook is small, so a bucket of one is a
 * disclosure: it says a named person in a public list of usernames signed from
 * a specific country. With a short enough list that identifies them. Folding
 * the thin buckets costs the map nothing visible — a single highlighted
 * country is not a shape anyone reads — and stops the aggregate being
 * per-signer data.
 */
const MIN_COUNTRY_COUNT = 3;

/** Totals for the map and the heading, in one grouped pass. */
export async function getStats(): Promise<GuestbookStats> {
  return cached(STATS_KEY, FRESH_SECONDS, async () => {
    const rows = await getDb()
      .select({ country: schema.guestbook.country, n: count() })
      .from(schema.guestbook)
      .groupBy(schema.guestbook.country);

    const stats: GuestbookStats = { total: 0, counts: {}, unplaced: 0 };
    const placed: Record<string, number> = {};

    for (const row of rows) {
      stats.total += row.n;
      // `T1` is Tor's placeholder; imported rows have no country. Both unplaced.
      if (row.country && row.country !== "T1" && /^[A-Z]{2}$/.test(row.country)) {
        placed[row.country] = (placed[row.country] ?? 0) + row.n;
      } else {
        stats.unplaced += row.n;
      }
    }

    // Second pass, because the threshold applies to the country's whole count,
    // not to whichever row happened to be read first.
    for (const [country, n] of Object.entries(placed)) {
      if (n >= MIN_COUNTRY_COUNT) {
        stats.counts[country] = n;
      } else {
        stats.unplaced += n;
      }
    }

    return stats;
  });
}

/**
 * Drops the cached first page and totals together, so a writer sees their own
 * change on the redirect. Failures are swallowed — the write is committed and
 * the cache expires within the minute anyway.
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
 * When this signer last posted, for the rate limit. Its own query, since a
 * 25-row page usually will not contain it. Indexed, so it reads one row.
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
