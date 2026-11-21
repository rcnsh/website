# 0046. File search is bounded, reads the cached tree, and is edge-cached for visitors only

Search is unauthenticated, so a live pass over R2 per query would be a bucket scan anyone can trigger. `searchKeys` (`src/lib/bucket-view.ts`) reads the cached tree, and scans R2 (bounded to 20 pages) only when the bucket is too big to tree. It filters by the reader before applying `SEARCH_LIMIT` (100), so keys the reader cannot see do not use up the limit.

`/api/files/search` (`src/pages/api/files/search.ts`) walks every key of the cached tree, and reading and parsing the whole tree from KV dominates each call. The route sits on the `scan` rate-limit budget (`src/lib/throttle.ts`) and is edge-cached for visitors. The owner's searches are never cached.

Queries are trimmed and truncated to 64 characters (`MAX_QUERY`). An unbounded query is an unbounded cache key, which turns the edge cache into a miss generator and sends every call back to a full walk of the tree. The edge cache key is the lowercased, encoded query plus `v=<rulesVersion>`, so `?q=x&`, `?q=X` and stray parameters share one entry instead of minting several, and a folder that was just unlisted drops out at once instead of after the cached answer expires.

Responses send `vary: cookie` so the browser does not keep the visitor copy after sign-in, but the edge copy is never keyed on the cookie: the owner skips the edge cache entirely, so it only ever holds the visitors' answer. The client's `SEARCH_MIN` (2, `src/lib/files-nav.ts`) matches the minimum query length the route accepts, because the server refuses anything shorter.

In the browser (`src/components/react/FileBrowser.tsx`), a search failure is tracked separately from an empty result, so a search that never ran does not read as "Nothing matches". Each new query aborts the previous request, and the `AbortError` from a superseded search is not treated as a failure. The URL hash is not updated while results are shown: search results are a view, not a location to link to.
