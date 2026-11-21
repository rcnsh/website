# 0106. The now-playing contract and freshness logic are split for the bundle and tests

`src/lib/now-playing.ts` holds the payload type (`NowPlayingPayload`) and every timing (`CACHE_SECONDS`, `PLAY_SETTLE_MS`, `PLAYED_REFRESH_MS`, `END_RETRY_MS`, `END_RETRIES`, `PLAYED_EVENT`), shared by the route and `NowPlaying.tsx`. It is bundled into the page, so it stays free of `cloudflare:workers` and of any runtime import.

The route's freshness logic lives in `src/lib/now-playing-state.ts` (`createNowPlaying`), with the edge cache, reads, clock, `waitUntil` and `sleep` injected and no `cloudflare:workers` import, so it tests under node; `src/lib/now-playing-server.ts` binds it to the Worker. The payload sent to the browser omits the track id: the widget needs only what it shows, so the id stays server-side, and `now-playing-state.test.ts` pins that.
