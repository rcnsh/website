# 0119. Owner play buttons render for everyone and show only for the owner

Pages and server islands are cached publicly, so nothing about the reader can be in their markup. A play button that starts a track on the owner's Spotify therefore cannot be rendered for the owner alone, and every copy carries the buttons.

`PlayButton` (`src/components/music/PlayButton.astro`, and `src/components/react/PlayButton.tsx` for React lists) renders for every visitor, hidden by `.play-track` in `global.css`. `PlayOnSpotify` (`src/components/music/PlayOnSpotify.astro`, in `Layout`) checks the owner hint with `hasOwnerHint()` and, when it is present, sets `data-owner` on `<html>`; `html[data-owner] .play-track` reveals the buttons. The same script handles clicks with one document-level `click` listener that matches `PLAY_SELECTOR`, because buttons in server islands and live React widgets render after the script runs and could not be bound one by one. A click posts `{ track_id }` to `/api/music/play` and dispatches `music:played` on success.

`PlayButton.astro`, `PlayButton.tsx`, `PlayOnSpotify` and the `.play-track` rules in `src/styles/global.css` all take their class, attribute and selector names from `src/lib/track-play.ts`, which keeps the two renderers, the listener and the CSS from drifting. `playButtonAttributes` returns every attribute except the class, since Astro spells it `class` and React `className`.

## Consequences

The owner hint is only a hint: it reveals buttons, and `/api/music/play` still runs the owner guard on every request.
