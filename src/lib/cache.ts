import { env, waitUntil } from "cloudflare:workers";

/**
 * Stale-while-revalidate cache over the CACHE KV namespace. Every upstream call
 * (Spotify, GitHub) goes through here so a visitor never waits on a third-party
 * API: a stale value is returned immediately and refreshed after the response.
 *
 * Only a cold miss blocks. Entries outlive `freshFor` by STALE_GRACE so there
 * is always something stale to serve.
 */

type Entry<T> = { v: T; t: number };

/** How long a value may be served stale after it stops being fresh. */
const STALE_GRACE_SECONDS = 60 * 60 * 24 * 7;

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
    const stale = Date.now() - hit.t >= freshForSeconds * 1000;

    if (stale) {
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
