/**
 * What the lattice field is asked to draw, shared by the things that never
 * import each other: NowPlaying publishes the cover it is showing, and the
 * field (`lattice/field.ts`) redraws it on the grid. Dependency-free, since it
 * lands in the now-playing bundle. Module state, so the cover survives a soft
 * navigation and the next page's field starts from it.
 */

export const COVER_EVENT = "lattice:cover";

export type Cover = {
  /** The image, from a host that answers with CORS (Spotify's CDN does). */
  image: string;
  /** What the picture is, for the caption beside the field. */
  label: string;
  /** Playing now, as against the last thing played. */
  live: boolean;
};

/** What the caption beside the field says the triangles are drawing. */
export function coverCaption(cover: Cover | null): string {
  if (!cover) return "the rcn mark";
  // The qualifier leads, so a long title truncates rather than it.
  return cover.live ? `what's playing now: ${cover.label}` : `the last thing played: ${cover.label}`;
}

let cover: Cover | null = null;
/** Dev only: a `?cover=` test cover, which the now-playing widget may not replace. */
let pinned = false;

export function currentCover(): Cover | null {
  return cover;
}

/** `null` when nothing is playing and nothing was: the field shows the mark. */
export function publishCover(next: Cover | null): void {
  // Optional chaining only so node --test, which has no import.meta.env, can load it.
  if (import.meta.env?.DEV && pinned) return;
  if (next?.image === cover?.image && next?.label === cover?.label && next?.live === cover?.live) return;
  cover = next;
  document.dispatchEvent(new CustomEvent(COVER_EVENT));
}

/** Dev only, with no warehouse token: draw this cover whatever is playing. */
export function pinCover(image: string): void {
  publishCover({ image, label: "test cover", live: true });
  pinned = true;
}
