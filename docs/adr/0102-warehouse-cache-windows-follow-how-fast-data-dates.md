# 0102. Warehouse cache windows follow how fast each read's data dates

`cached()` serves a stale value at once and refreshes behind it, so a long freshness window only means the warehouse is polled less. The limit is how stale the data can be before it reads as wrong.

`TOP_FRESHNESS` (`src/lib/spotify-reads.ts`) is 1 hour for `short_term`, 6 hours for `medium_term` and 24 hours for `long_term`: "4 weeks" shifts day to day, "6 months" over weeks, "all time" barely at all. Recent plays are fresh for 5 minutes with `maxStaleSeconds` capped at 6 hours, because every row renders as "played N ago" and week-old stale data reads as broken. `/api/spotify/top` gives the browser a 15-minute ceiling instead of these windows (CLAUDE.md, Caching).
