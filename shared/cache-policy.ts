/**
 * Every `Cache-Control` the site sends, by name. Dependency-free so the
 * `_headers` generator, the middleware and the routes share one vocabulary;
 * the per-route table is `policies` in `src/lib/http.ts`.
 */

export type CachePolicy = string;

export type PublicOptions = {
  /** `s-maxage`: how long a shared cache may keep it, if not `max-age`. */
  edge?: number;
  /** `stale-while-revalidate`, in seconds. */
  swr?: number;
};

/** Anyone may keep it for `seconds`. */
export function publicFor(seconds: number, { edge, swr }: PublicOptions = {}): CachePolicy {
  return [
    "public",
    `max-age=${seconds}`,
    edge === undefined ? null : `s-maxage=${edge}`,
    swr === undefined ? null : `stale-while-revalidate=${swr}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Nobody keeps it. */
export const noStore: CachePolicy = "no-store";

/**
 * A failure or fallback: a transient upstream fault must not outlive itself
 * in any cache. The edge cache module never stores a response sent with it.
 */
export const uncachedError: CachePolicy = noStore;

/**
 * Rendered for one reader (the owner, a session, a throttled caller), so no
 * shared cache may hold it and the browser should not either.
 */
export const privateNoStore: CachePolicy = "private, no-store";

/**
 * Everything under `/_server-islands/*`, as a class. Only sound while every
 * island renders public data; see CLAUDE.md § Maintenance › Caching.
 */
export const serverIslands: CachePolicy = publicFor(60, { edge: 300, swr: 3600 });

/** The `_headers` default for statically served pages: revalidate, but from the edge. */
export const staticAssets: CachePolicy = publicFor(0, { edge: 600, swr: 86400 });
