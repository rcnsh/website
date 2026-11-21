# 0125. Music stats read aggregate-only warehouse routes through KV

`/music/stats` reads the warehouse's `/api/stats/*` routes (`src/lib/music-stats.ts`, `load`), which hold only counts, shares, names and months, never play rows. The warehouse snapshots those routes for hours, so the KV-cached reads mostly keep warehouse round trips off the islands' critical path. Their schemas describe only rendered fields and throw on a mismatch, so a shape change is never cached as an empty page (CLAUDE.md, Maintenance > Data).

Each entry stays fresh for at most half the warehouse's own snapshot window, so a warehouse refresh shows up on the site within that same window. `maxStaleSeconds` is capped per route, because stale data reads as wrong past a point: "on repeat" a week late is a different list. `getOnRepeat` is 30 minutes fresh and 1 day stale; `getRhythm` 1 hour and 14 days; `getTopAlbums` and `getTopOverTime` 6 hours and 14 days; `getEras` 6 hours and 30 days.
