# 0088. KV caches the first page and totals; the edge caches every page

D1 bills rows read against a daily allowance shared with sessions, so the guestbook's first page (`guestbook:page:1`) and totals (`guestbook:stats`) are cached in KV through `cached()` for `FRESH_SECONDS` (60, in `src/lib/guestbook-cache.ts`). Only page 1 goes to KV: every visitor lands on it, and caching deeper pages would mean a KV entry per caller-chosen cursor. Deeper pages read D1.

`/api/guestbook/list` (`src/pages/api/guestbook/list.ts`) is public and edge-caches each page with `edgeCached` under `LIST_CACHE`, because without it every deep page would be a D1 read on an anonymous route. Its policy, `policies.guestbookList`, is `publicFor(FRESH_SECONDS)`, so its max-age equals page 1's KV window and both layers expire together; a write drops both (see ADR-0089). A malformed cursor serves page 1. The response omits `country` from each entry, because country per entry would de-anonymise signers.
