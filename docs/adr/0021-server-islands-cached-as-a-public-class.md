# 0021. Server islands are cached publicly as a class

Every server island today renders public data, so `/_server-islands/*` responses are cached as a class rather than per island. `src/middleware.ts` gives each one `islandPolicy(path)` (`src/lib/http.ts`), which returns `serverIslands` (`public, max-age=60, s-maxage=300, stale-while-revalidate=3600`) for all but `LIVE_ISLANDS`. This is sound only while every island stays non-personalised: an island that read the session would let the edge serve one reader's fragment to another. Nothing enforces that.

`LIVE_ISLANDS` (`GuestbookTotals`, `GuestbookCountries`, `GuestbookEntries`) are public but get `noStore`. The page a guestbook post or delete redirects to must show the reader's write, and each of these islands reads the KV copies that write drops. The names follow the page's import, because Astro names an island after the import; a test in `src/lib/http.test.ts` checks `LIVE_ISLANDS` against the islands the pages actually import, since renaming an import would quietly give a live island the public cached policy.

See ADR-0090.
