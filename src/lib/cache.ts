import { env, waitUntil } from "cloudflare:workers";
import { createCache } from "./swr";

/**
 * Stale-while-revalidate over the CACHE KV namespace: only a cold miss blocks.
 * `maxStale` is the counterweight, for date-anchored data that looks plainly
 * wrong when it is weeks old. The logic and its tests live in lib/swr.
 */

export type { CacheOptions } from "./swr";

export const { cached, invalidate } = createCache({
  store: () => env.CACHE,
  now: Date.now,
  waitUntil,
});
