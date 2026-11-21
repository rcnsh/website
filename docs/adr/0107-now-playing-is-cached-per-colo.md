# 0107. Now-playing is cached once per colo for 10 seconds

The live now-playing and last-played reads are proxied through the warehouse to Spotify and carry no cache policy in `src/lib/spotify-reads.ts`; `getNowPlaying` (`src/lib/spotify.ts`) has no KV cache and throws on a shape mismatch, so a bad shape is never reported as silence. The route in front collapses visitor polls instead.

The now-playing response is identical for every visitor, so one copy per colo serves everyone through `edgeCached` (`src/lib/now-playing-state.ts`). That copy is served for `CACHE_SECONDS` (10, `src/lib/now-playing.ts`); since the live read is uncached upstream, this window is what collapses visitor polls into one warehouse call.

Each cached copy carries an `x-cached-at` stamp, and a hit advances `progressMs` by the copy's age, capped at `durationMs`, so the client's bar does not rewind when served an older copy.

See ADR-0027.
