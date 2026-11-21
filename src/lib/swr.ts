import { coalesce } from "./coalesce.ts";

type Entry<T> = { v: T; t: number };

export type CacheStore = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export type CacheDeps = {
  store: () => CacheStore | undefined;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
};

export const STALE_GRACE_SECONDS = 60 * 60 * 24 * 30;

export type CacheOptions = {
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
      }
    };

    let hit: unknown = null;
    try {
      hit = await kv.get(key, "json");
    } catch {
    }

    if (isEntry<T>(hit)) {
      const age = now() - hit.t;

      if (age >= maxStaleSeconds * 1000) {
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
        const refresh = coalesce(key, loader)
          .then(write)
          .catch((error) => {
            console.error(`[cache] background refresh failed for ${key}`, error);
          });

        try {
          waitUntil(refresh);
        } catch {
        }
      }

      return hit.v;
    }

    const value = await coalesce(key, loader);
    await write(value);
    return value;
  }

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
