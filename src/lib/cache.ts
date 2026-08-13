import { env, waitUntil } from "cloudflare:workers";

/**
 * Stale-while-revalidate cache over the CACHE KV namespace.
 *
 * Every upstream call on this site (Spotify, GitHub) goes through here. The
 * point is that a visitor should never wait on a third-party API: once a value
 * has been fetched even once, every later request is served straight from KV
 * and any refresh happens after the response has already been sent.
 *
 * Three outcomes:
 *   fresh  — age < freshFor. Return it, do nothing else.
 *   stale  — age >= freshFor but the entry still exists. Return it immediately
 *            and refresh in the background via `waitUntil`, so the current
 *            request pays nothing.
 *   miss   — nothing cached. Fetch synchronously; this is the only slow path,
 *            and only the first visitor after a deploy or a long idle hits it.
 *
 * KV entries are kept far longer than `freshFor` (see STALE_GRACE) precisely so
 * there is something stale to serve. An entry that expired outright would turn
 * every subsequent request back into a blocking fetch.
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
      // Refresh after the response goes out. Failures are deliberately
      // swallowed — the visitor already has a usable value.
      const refresh = loader()
        .then(write)
        .catch((error) => {
          console.error(`[cache] background refresh failed for ${key}`, error);
        });

      try {
        waitUntil(refresh);
      } catch {
        // No request context to attach to — prerendering at build time, or a
        // runtime that doesn't provide one. The refresh is still in flight;
        // it just isn't guaranteed to be awaited. Serving stale is fine.
      }
    }

    return hit.v;
  }

  const value = await loader();
  await write(value);
  return value;
}
