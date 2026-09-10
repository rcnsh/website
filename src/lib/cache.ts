import { coalesce } from "./coalesce";
import { env, waitUntil } from "cloudflare:workers";

/**
 * Stale-while-revalidate over the CACHE KV namespace: only a cold miss blocks.
 * `maxStale` is the counterweight, for date-anchored data that looks plainly
 * wrong when it is weeks old.
 */

type Entry<T> = { v: T; t: number };

/** How long an entry survives past `freshFor`, i.e. how long stale is servable. */
const STALE_GRACE_SECONDS = 60 * 60 * 24 * 30;

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

export async function cached<T>(
  key: string,
  freshForSeconds: number,
  loader: () => Promise<T>,
  { maxStaleSeconds = STALE_GRACE_SECONDS }: CacheOptions = {},
): Promise<T> {
  const kv = env.CACHE;
  if (!kv) return coalesce(key, loader);

  const write = async (value: T) => {
    try {
      await kv.put(key, JSON.stringify({ v: value, t: Date.now() } satisfies Entry<T>), {
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
    const age = Date.now() - hit.t;

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
