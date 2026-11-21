import { env, waitUntil } from "cloudflare:workers";
import { createCache } from "./swr";

export type { CacheOptions } from "./swr";

export const { cached, invalidate } = createCache({
  store: () => env.CACHE,
  now: Date.now,
  waitUntil,
});
