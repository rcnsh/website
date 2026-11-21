export const FRESH_SECONDS = 60;

export const FIRST_PAGE_KEY = "guestbook:page:1";
export const STATS_KEY = "guestbook:stats";

export const LIST_CACHE = "guestbook-list";

export type Cursor = { createdAt: number; id: number };

export function encodeCursor(cursor: Cursor): string {
  return `${cursor.createdAt}:${cursor.id}`;
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;

  const match = /^(\d{1,15}):(\d{1,15})$/.exec(raw);
  if (!match) return null;

  return { createdAt: Number(match[1]), id: Number(match[2]) };
}

export function listUrl(origin: string, after: Cursor | null): string {
  return `${origin}/api/guestbook/list${after ? `?after=${encodeURIComponent(encodeCursor(after))}` : ""}`;
}

export type InvalidationDeps = {
  kv: (...keys: string[]) => Promise<void>;
  edge: (name: string, url: string) => Promise<unknown>;
};

export function guestbookInvalidation({ kv, edge }: InvalidationDeps) {
  return async (origin: string, page: Cursor | null = null): Promise<void> => {
    await Promise.all([
      kv(FIRST_PAGE_KEY, STATS_KEY),
      edge(LIST_CACHE, listUrl(origin, null)),
      page ? edge(LIST_CACHE, listUrl(origin, page)) : null,
    ]);
  };
}
