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
};

let cover: Cover | null = null;

export function currentCover(): Cover | null {
  return cover;
}

/** `null` when nothing is playing and nothing was: the field shows the mark. */
export function publishCover(next: Cover | null): void {
  if (next?.image === cover?.image && next?.label === cover?.label) return;
  cover = next;
  document.dispatchEvent(new CustomEvent(COVER_EVENT));
}
