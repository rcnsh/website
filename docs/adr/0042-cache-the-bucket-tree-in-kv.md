# 0042. Cache the bucket tree in KV with a one-day stale ceiling

Every /files listing, search and island reads the bucket's whole object tree, and an R2 LIST per request is slow and costs money. `src/lib/bucket.ts` keeps the packed tree in KV through `cached()` under `TREE_CACHE_KEY` (`files:tree:1`). It is fresh for `TREE_FRESH_SECONDS` (300s) and is served stale behind a background refresh for at most 24 hours (`maxStaleSeconds: 60 * 60 * 24`). Past that, the request blocks on a fresh listing, because after a day a listing that misses an upload is worse than a slow page.

The key's version suffix is bumped whenever the packing format changes. Code reading a value in the old packing would misparse it; a new key orphans the old entries instead, and they expire on their own.

The listing calls R2 `list()` with no `include` option. Asking for `httpMetadata` or `customMetadata` costs extra on every list call, and the tree uses neither.
