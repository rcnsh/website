# 0089. A guestbook write drops page 1, the totals and the page it changed

A writer must see their own change on the page the redirect lands on. `invalidate(origin, removed?)` in `src/lib/guestbook.ts` drops KV's first page and totals, and this colo's edge copies of page 1 and of the deep page a removed entry sat on. Later pages are not touched: their cursors move with the rows, so their keys change on their own. The sign route awaits invalidation before redirecting, because the landing page reads the first page and totals straight back.

To find a deleted entry's page, `pageHolding` counts the rows newer than it in D1 and rebuilds the cursor that page was requested with (null for page 1). Rows newer than the entry keep their positions after it is deleted, so the answer is still right once it is gone.

The cache names, keys and drop logic live in `src/lib/guestbook-cache.ts` (`guestbookInvalidation`), with the KV and edge droppers injected, so the invalidation runs under `node --test` without D1 or `cloudflare:workers`. Both droppers swallow and log their own failures, and so does `pageHolding`'s lookup: the write is already committed when invalidation runs, so a failed drop must not fail the request, and the entries age out regardless.

`/api/guestbook/delete` invalidates only when the delete removed a row. A delete that removed nothing cannot have made anything stale, and invalidating unconditionally would let any signed-in caller drop the two KV keys guarding `getStats()`'s full table scan as fast as they like.
