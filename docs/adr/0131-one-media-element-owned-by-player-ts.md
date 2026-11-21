# 0131. One media element for the session, owned by src/lib/player.ts

Playback must survive soft navigations and full page loads alike, so the site has one media element for the session (CLAUDE.md, Site-wide player). `src/lib/player.ts` creates and owns it. It imports no React and touches no document at import time, because `Layout`'s script and the /files island both import it and the island also renders on the server. Player state and its saved copy live in `src/lib/player-state.ts`, which is pure so it tests under node.

`MiniPlayer` (`src/components/player/MiniPlayer.astro`) is the floating box, persisted with `transition:persist`, which keeps the node and the media element inside it alive and playing across every soft navigation. Its script binds once per document and does not rebind on swaps, since both the box and the script's bindings survive soft navigations. The box calls `startPlayer` once per document: it is the resting host, restores saved playback and saves on `pagehide`.

The element sits in the box's shadow root and is styled inline, because the box's stylesheet does not reach into a shadow root.

See ADR-0132.
