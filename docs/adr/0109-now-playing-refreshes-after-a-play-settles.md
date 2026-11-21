# 0109. Now-playing refreshes once a play from the site has settled

After the owner starts a track from the site, the warehouse refetches Spotify `PLAY_SETTLE_MS` later. `PLAY_SETTLE_MS` (3000, `src/lib/now-playing.ts`) mirrors the music-warehouse's constant of the same name; the value lives in that repo and the two change together.

On the server, `invalidateAfterPlay` (`src/lib/now-playing-state.ts`) drops the colo copy immediately, since it names the old track for up to a window, and again after `PLAY_SETTLE_MS`, since a poll between the play and the warehouse's refetch may have cached what Spotify had not yet caught up on.

On the client, `NowPlaying` refreshes `PLAYED_REFRESH_MS` (`PLAY_SETTLE_MS` + 500ms) after the `music:played` event. By then the route's post-settle invalidation has run, so the poll gets the new track; asked sooner, it would get the old one back.
