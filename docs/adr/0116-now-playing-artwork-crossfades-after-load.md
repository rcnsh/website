# 0116. Now-playing artwork crossfades only after the new cover loads

`NowPlaying` (`src/components/react/NowPlaying.tsx`) holds its artwork as `[current]` or `[outgoing, incoming]`. The incoming cover fades in only after its image loads, and the outgoing one is dropped when the fade ends, so the tile never flashes empty and a fade started before load does not fade in nothing. The first cover keeps the skeleton pulse until it loads and does not animate.

Covers get an inset 1px `rgba(255,255,255,0.06)` hairline, since a dark sleeve otherwise has no visible edge against the tile.

The widget also publishes its current cover, title and live state to the lattice field through `lattice-source.ts`, which draws the card's cover (CLAUDE.md, Lattice field).
