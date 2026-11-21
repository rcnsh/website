# 0108. Now-playing falls back to live last played, then stored plays

When nothing is playing the card shows the last track played. The fallback chain in `read` (`src/lib/now-playing-state.ts`) is the live now-playing read, then the live last-played read, then stored plays. Stored plays arrive only on the warehouse's ingest cron, so `getRecentTracks()` can be half an hour behind; last played is therefore read live, and stored plays are the last resort when the live read fails.

A `WarehouseShapeError` from the live now-playing read is treated as "not playing" and falls through to last played. The read throws so that no cache stores a bad shape as silence; this card alone turns it into not playing. Any other error propagates to the route's 503.
