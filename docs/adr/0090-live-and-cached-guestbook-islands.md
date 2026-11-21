# 0090. Guestbook islands split into live and cached, and none reads the session

Everything under `/_server-islands/*` is cached publicly with the `serverIslands` policy (`shared/cache-policy.ts`: `max-age=60, s-maxage=300, stale-while-revalidate=3600`), so an island that read the session would let the edge serve one reader's fragment to another. No guestbook island reads the session. The home page's guestbook figure (`src/components/home/GuestbookFigure.astro`) reads only the cached first page and totals, the same public data `/guestbook` shows signed out.

`GuestbookTotals`, `GuestbookEntries` and `GuestbookCountries` are in `LIVE_ISLANDS` (`src/lib/http.ts`), which `islandPolicy` answers with `no-store`. Totals and entries read the KV first page and totals that a guestbook write invalidates, because the page a post or delete redirects to must show the change: a signer's own signature must count there. The country ranking is live so that it agrees with the totals beside it on that page.

The map (`src/components/widgets/GuestbookMapIsland.astro`) keeps the public `serverIslands` policy. `GuestbookMap` inlines the whole world outline (about 126 KB of `src/lib/world.ts`), so it is its own server island, kept out of the page and cached apart from the live islands. It shows the same counts as the ranking but may lag them by its cache window. It takes no props and fetches its own stats: island props are encrypted into the `?e=` query parameter and are part of the cache key, so passing the counts in would make the URL change with the data and defeat caching.

See ADR-0021.
