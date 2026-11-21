# 0110. Now-playing stops claiming to be live after repeated failures

When `/api/spotify/now-playing` fails, the route (`src/lib/now-playing-state.ts`, `respond`) answers 503 with `{ state: "error" }` under the `uncachedError` policy. A 5xx makes the client keep its last good card instead of replacing it.

After `STALE_AFTER_FAILURES` (3) consecutive failed polls, `NowPlaying` (`src/components/react/NowPlaying.tsx`) keeps the last good track but stops asserting it is current: no live state, no interpolation, and `coverLive` false. A frozen bar under a "Now playing" label is a worse lie than saying nothing, a dead endpoint must not read as a paused one, and its last track is not playing now. Progress interpolation runs only while the card is live, playing and not disconnected, since advancing a reading that is no longer refreshed invents progress.
