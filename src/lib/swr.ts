import { coalesce } from "./coalesce.ts";

// The cache logic, with the store, clock and background work passed in.
// lib/cache wires it to Workers KV; this file stays loadable under `node --test`.

type Entry<T> = { v: T; t: number };

/** The slice of a KV namespace the cache uses. */
export type CacheStore = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export type CacheDeps = {
  /** Read per call: the binding can be absent, and then nothing is cached. */
  store: () => CacheStore | undefined;
  now: () => number;
  /** Throws outside a request context, e.g. while prerendering. */
  waitUntil: (promise: Promise<unknown>) => void;
};

/** How long an entry survives past `freshFor`, i.e. how long stale is servable. */
export const STALE_GRACE_SECONDS = 60 * 60 * 24 * 30;

export type CacheOptions = {
  /** Age past which stale is worse than waiting. Defaults to the grace window. */
  maxStaleSeconds?: number;
};

function isEntry<T>(value: unknown): value is Entry<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    "t" in value &&
    typeof (value as Entry<T>).t === "number"
  );
}

export function createCache({ store, now, waitUntil }: CacheDeps) {
  async function cached<T>(
    key: string,
    freshForSeconds: number,
    loader: () => Promise<T>,
    { maxStaleSeconds = STALE_GRACE_SECONDS }: CacheOptions = {},
  ): Promise<T> {
    const kv = store();
    if (!kv) return coalesce(key, loader);

    const write = async (value: T) => {
      try {
        await kv.put(key, JSON.stringify({ v: value, t: now() } satisfies Entry<T>), {
          expirationTtl: freshForSeconds + STALE_GRACE_SECONDS,
        });
      } catch {
        // A cache write must never take the page down.
      }
    };

    let hit: unknown = null;
    try {
      hit = await kv.get(key, "json");
    } catch {
      // Ditto for reads.
    }

    if (isEntry<T>(hit)) {
      const age = now() - hit.t;

      if (age >= maxStaleSeconds * 1000) {
        // Too old to show. Block, but fall back to stale rather than throwing.
        try {
          const value = await coalesce(key, loader);
          await write(value);
          return value;
        } catch (error) {
          console.error(`[cache] refresh of expired ${key} failed, serving stale`, error);
          return hit.v;
        }
      }

      if (age >= freshForSeconds * 1000) {
        // Failures are swallowed — the visitor already has a usable value.
        const refresh = coalesce(key, loader)
          .then(write)
          .catch((error) => {
            console.error(`[cache] background refresh failed for ${key}`, error);
          });

        try {
          waitUntil(refresh);
        } catch {
          // No request context — prerendering. The refresh may not finish.
        }
      }

      return hit.v;
    }

    const value = await coalesce(key, loader);
    await write(value);
    return value;
  }

  /**
   * Drops entries so the next read loads afresh. Failures are swallowed: callers
   * invalidate after a committed write, and the entry ages out regardless.
   */
  async function invalidate(...keys: string[]): Promise<void> {
    const kv = store();
    if (!kv) return;

    await Promise.all(
      keys.map(async (key) => {
        try {
          await kv.delete(key);
        } catch (error) {
          console.error(`[cache] invalidation of ${key} failed`, error);
        }
      }),
    );
  }

  return { cached, invalidate };
}
