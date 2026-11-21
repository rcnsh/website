import { and, count, desc, eq, gt, lt, or } from "drizzle-orm";
import { cached, invalidate as invalidateCache } from "./cache";
import { getDb, schema } from "./db";
import { invalidateEdge } from "./edge";
import {
  type Cursor,
  FIRST_PAGE_KEY,
  FRESH_SECONDS,
  guestbookInvalidation,
  STATS_KEY,
} from "./guestbook-cache.ts";

export { type Cursor, decodeCursor, encodeCursor } from "./guestbook-cache.ts";

export const PAGE_SIZE = 25;

export type GuestbookEntry = {
  id: number;
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  message: string;
  createdAt: number;
};

export type GuestbookPage = {
  entries: GuestbookEntry[];
  next: Cursor | null;
};

export type GuestbookStats = {
  total: number;
  counts: Record<string, number>;
  unplaced: number;
};

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

async function readPage(after: Cursor | null): Promise<GuestbookPage> {
  const db = getDb();
  const at = after ? new Date(after.createdAt * 1000) : null;

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

export async function getPage(after: Cursor | null = null): Promise<GuestbookPage> {
  if (after) return readPage(after);
  return cached(FIRST_PAGE_KEY, FRESH_SECONDS, () => readPage(null));
}

const MIN_COUNTRY_COUNT = 3;

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
      if (row.country && row.country !== "T1" && /^[A-Z]{2}$/.test(row.country)) {
        placed[row.country] = (placed[row.country] ?? 0) + row.n;
      } else {
        stats.unplaced += row.n;
      }
    }

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

const drop = guestbookInvalidation({ kv: invalidateCache, edge: invalidateEdge });

async function pageHolding(entry: Cursor): Promise<Cursor | null> {
  const db = getDb();
  const at = new Date(entry.createdAt * 1000);
  const [{ newer }] = await db
    .select({ newer: count() })
    .from(schema.guestbook)
    .where(
      or(
        gt(schema.guestbook.createdAt, at),
        and(eq(schema.guestbook.createdAt, at), gt(schema.guestbook.id, entry.id)),
      ),
    );

  const page = Math.floor(newer / PAGE_SIZE);
  if (page === 0) return null;

  const [row] = await db
    .select({ createdAt: schema.guestbook.createdAt, id: schema.guestbook.id })
    .from(schema.guestbook)
    .orderBy(desc(schema.guestbook.createdAt), desc(schema.guestbook.id))
    .limit(1)
    .offset(page * PAGE_SIZE - 1);

  return row ? { createdAt: Math.floor(row.createdAt.getTime() / 1000), id: row.id } : null;
}

export async function invalidate(origin: string, removed?: Cursor): Promise<void> {
  const page = removed
    ? await pageHolding(removed).catch((error) => {
        console.error("[guestbook] locating the changed page failed", error);
        return null;
      })
    : null;
  await drop(origin, page);
}

export async function lastPostedAt(githubId: number): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: schema.guestbook.createdAt })
    .from(schema.guestbook)
    .where(eq(schema.guestbook.githubId, githubId))
    .orderBy(desc(schema.guestbook.createdAt))
    .limit(1);

  return row?.createdAt ?? null;
}
