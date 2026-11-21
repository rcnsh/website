import { env } from "cloudflare:workers";
import { cached } from "@/lib/cache";
import { loadRules } from "@/lib/visibility";
import { createBucket } from "./bucket-view.ts";

export type { BucketView, PublicSummary, Reader } from "./bucket-view.ts";

const TREE_CACHE_KEY = "files:tree:1";

const TREE_FRESH_SECONDS = 300;

function requireBucket(): R2Bucket {
  const bucket = env.BUCKET;
  if (!bucket) {
    throw new Error("R2 binding `BUCKET` is missing. Check the r2_buckets entry in wrangler.jsonc.");
  }
  return bucket;
}

export const bucket = createBucket({
  list: (options) => requireBucket().list(options),
  cacheTree: (load) => cached(TREE_CACHE_KEY, TREE_FRESH_SECONDS, load, { maxStaleSeconds: 60 * 60 * 24 }),
  rules: loadRules,
});
