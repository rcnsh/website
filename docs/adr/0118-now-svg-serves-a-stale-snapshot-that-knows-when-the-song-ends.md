# 0118. /now.svg serves a stored snapshot that knows when its song ends

`src/pages/now.svg.ts` serves the card from a `cached()` snapshot (`now-svg:snapshot`) that is fresh for `SNAPSHOT_FRESHNESS` (15s). Past that, a view gets the stored snapshot at once and it refreshes in the background, so a view never waits on the warehouse once a snapshot exists. The 7-day on-repeat read behind the fallback line is cached separately (`on-repeat:7d`) and fresh for `REPEAT_FRESHNESS` (an hour), because it shifts slowly.

Since a stale snapshot is served without waiting, the snapshot (`NowSnapshot` in `src/lib/now-card.ts`) holds the live track with the time it ends (`endsAt`) and a fallback line, and `pickLine` drops the live track once `endsAt` has passed. Without `endsAt`, an old snapshot would claim a finished song is still playing.

`loadSnapshot` queries now-playing and on-repeat in parallel and throws only when both fail. Throwing lets `cached()` keep the stale snapshot rather than overwrite it (loaders must throw).

The response carries `policies.nowSvg` (`publicFor(30, { swr: 60 })`). GitHub's image proxy may keep the image about 30s anyway, the same order as the snapshot's 15s age, so a longer origin wait buys nothing.
