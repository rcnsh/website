# 0115. The now-playing tile keeps one shape across its states

`NowPlaying` (`src/components/react/NowPlaying.tsx`) renders the entire inside of its tile, head row included, in a `home` or `page` size, so the home tile and the larger `/music` tile share one component. Its layout holds still as the track changes. The slot under the title always renders: progress while playing, when it was played otherwise, so both states keep the same height. On the `page` layout the head row reserves the link's height (an 11px line plus `rule-link`'s padding), because the page's "Open in Spotify" comes and goes with the track and would shift the tile; home's link is always present.

The equaliser's bars (`src/components/music/now-playing.css`) have static heights as their resting state and animation only moves them, because reduced motion drops every animation and the equaliser must still show three bars.

On `/music` (`src/pages/music.astro`) the hero comes first in source order and the grid reorders now playing ahead of it from `sm` up, so the `h1` leads on phones and in reading order.
