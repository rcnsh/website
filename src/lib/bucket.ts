import { env } from "cloudflare:workers";
import { cached } from "@/lib/cache";
import { loadRules } from "@/lib/visibility";
import { createBucket } from "./bucket-view.ts";

export type { BucketView, PublicSummary, Reader } from "./bucket-view.ts";

/** KV key for the packed tree. Bump the suffix whenever the packing changes. */
const TREE_CACHE_KEY = "files:tree:1";

/** How long a cached tree is served before a refresh runs behind the response. */
const TREE_FRESH_SECONDS = 300;

function requireBucket(): R2Bucket {
  const bucket = env.BUCKET;
  if (!bucket) {
    throw new Error("R2 binding `BUCKET` is missing. Check the r2_buckets entry in wrangler.jsonc.");
  }
  return bucket;
}

/**
 * The file bucket, viewed per reader. Capped at a day of staleness, past
 * which a missing upload beats a slow page and the request blocks.
 */
export const bucket = createBucket({
  // No `include`: httpMetadata costs extra and isn't used.
  list: (options) => requireBucket().list(options),
  cacheTree: (load) => cached(TREE_CACHE_KEY, TREE_FRESH_SECONDS, load, { maxStaleSeconds: 60 * 60 * 24 }),
  rules: loadRules,
});
