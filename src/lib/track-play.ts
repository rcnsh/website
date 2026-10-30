/**
 * The markup both PlayButtons render and PlayOnSpotify listens for. The
 * `.play-track` rules in global.css match these names too.
 */
export const PLAY_CLASS = "play-track";
export const PLAY_TRACK_ATTR = "data-play-track";
export const PLAY_STATE_ATTR = "data-state";
export const PLAY_TITLE = "Play on Spotify";
export const PLAY_SELECTOR = `button[${PLAY_TRACK_ATTR}]`;

/** Everything on the button but its class, which Astro and React spell differently. */
export function playButtonAttributes(trackId: string, title: string) {
  return { [PLAY_TRACK_ATTR]: trackId, "aria-label": `Play ${title} on Spotify`, title: PLAY_TITLE };
}

export function isTrackId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z]{22}$/.test(value);
}
