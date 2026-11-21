# 0104. Recent plays come from the warehouse's stored history

Recent plays are read from the warehouse's stored history (`getRecentTracks` in `src/lib/spotify-reads.ts`) rather than proxied live, so they keep working when the Spotify grant has lapsed.

`RecentTracks` (`src/components/widgets/RecentTracks.astro`) reads `getRecentTracks(RECENT_WINDOW)` (50, `src/lib/listening.ts`), the same limit `ListeningStats` uses, and slices to 15. The cache key includes the limit (`recent:v4:<limit>`), so both widgets share one KV entry and one warehouse call.

The read maps several warehouse fields with care. Credits come from `artist_list`, not from splitting the joined `artists` string, since a name containing ", " would be split apart. `play_number` is which play of the song this was across every edition, because the warehouse counts plays per song, not per track id. A play's "from ..." context is shown only for album and artist contexts: playlist names stay private, and autoplay after a playlist ends is still reported as that playlist.

See ADR-0105.
