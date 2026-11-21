# 0103. Album art is requested at the size it is drawn

The warehouse returns 640px art, and shipping that for a 36px thumbnail is ten times the bytes.

The reads in `src/lib/spotify-reads.ts` request track art at 128px or more (`TRACK_ART`) and artist images at 320px or more (`ARTIST_ART`): track art draws at 56px at most, so 128 covers 2x density, and artist tiles are a grid column wide, around 160px on a phone. On `/music/stats`, `cover()` (`src/lib/music-stats-view.ts`) rewrites Spotify CDN URLs to the 64px (`ab67616d00004851`) or 300px (`ab67616d00001e02`) rendition. The prefix is a CDN convention, not an API, so an unrecognised URL passes through unchanged.
