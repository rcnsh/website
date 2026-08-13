import { env, waitUntil } from "cloudflare:workers";

/**
 * Stale-while-revalidate cache over the CACHE KV namespace. Every upstream call
 * (Spotify, GitHub) goes through here so a visitor never waits on a third-party
 * API: a stale value is returned immediately and refreshed after the response.
 *
 * Only a cold miss blocks. Entries outlive `freshFor` by STALE_GRACE so there
 * is always something stale to serve — a month, because the alternative to a
 * long grace window is a scheduled job that can rot silently.
 *
 * `maxStale` is the counterweight: date-anchored data (recently played, the
 * contribution graph) looks plainly wrong when it's weeks old, so those opt
 * into a ceiling past which the cache blocks and refetches instead.
 */

type Entry<T> = { v: T; t: number };

/** How long an entry survives past `freshFor`, i.e. how long stale is servable. */
const STALE_GRACE_SECONDS = 60 * 60 * 24 * 30;

export type CacheOptions = {
  /**
   * Age past which stale is worse than waiting. Defaults to the full grace
   * window; set it lower for anything the reader can date at a glance.
   */
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
  if (!kv) return loader();

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
      // Too old to show. Block on a fresh fetch — but if that fails, the old
      // value still beats an error, so fall back to it rather than throwing.
      try {
        const value = await loader();
        await write(value);
        return value;
      } catch (error) {
        console.error(`[cache] refresh of expired ${key} failed, serving stale`, error);
        return hit.v;
      }
    }

    if (age >= freshForSeconds * 1000) {
      // Failures are swallowed — the visitor already has a usable value.
      const refresh = loader()
        .then(write)
        .catch((error) => {
          console.error(`[cache] background refresh failed for ${key}`, error);
        });

      try {
        waitUntil(refresh);
      } catch {
        // No request context — prerendering at build time. The refresh is
        // still in flight, just not guaranteed to finish. Stale is fine.
      }
    }

    return hit.v;
  }

  const value = await loader();
  await write(value);
  return value;
}
