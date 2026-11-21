# 0121. Track rows use a stretched title link with controls as siblings

A row in a music list should open the song wherever it is clicked, yet the owner's play button and each artist link must stay separately clickable, and a button cannot sit inside a link.

Rows use a stretched title link (`after:absolute after:inset-0`) with the play button as a sibling beside the title (`src/components/music/stats/TopOverTime.astro`). In `src/components/widgets/RecentTracks.astro` the artist links are layered above the stretched title link, so the row opens the song while each artist opens on its own.

A row gets a link and a play button only when it has something Spotify can open. The track id is nullish in the read schemas (`src/lib/spotify-reads.ts`), because local files have no id and cannot be played remotely; such rows, and top-over-time songs without a warehouse track id, render the title as plain text. `spotifyUrl` (`src/lib/music-stats-view.ts`) returns null for ids starting with `name:`, the placeholder carried by artists known only from the imported Spotify export. A top song's `track_id` (`src/lib/music-stats.ts`) is its most-played edition in the period, since a song can have several editions (album, single, remaster) and the link and play button go to the one actually played most.
