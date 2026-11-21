# 0036. Bucket reads go through a reader-scoped view

All bucket reads for a response go through `bucket.view(reader)`. The logic lives in `src/lib/bucket-view.ts` with the R2 listing, the KV tree cache and the rules injected, so the unfiltered bucket is reachable only by asking as the owner, and the module loads under `node --test`.

A `Reader` may be a boolean or a function. A function is called lazily and at most once per view, so a public download, which never needs to know the reader, costs no session lookup.
