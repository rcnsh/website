# 0124. Music skeletons mirror their islands' loaded markup

Fallbacks on `/music` and `/music/stats` follow the site's skeleton rule (CLAUDE.md, Skeletons) so a tile keeps its loaded height and does not jump when data lands.

On `/music` (`src/pages/music.astro`) fallbacks mirror their islands' markup and row counts: 12 explorer rows, 15 recent tracks. On `/music/stats` they use the islands' containers, row counts and type classes, with `placeholder-text` in single lines and transparent ghost text where a line wraps; row counts and wrapping match the common case, and real data can still move them a line or two. `NowPlaying`'s loading state (`src/components/react/NowPlaying.tsx`) puts each placeholder bar inside a line carrying the loaded text's classes and assumes a one-line title, the commoner case, so line heights match and real data does not move anything.

See ADR-0193.
