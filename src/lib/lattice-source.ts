export const COVER_EVENT = "lattice:cover";

export type Cover = {
  image: string;
  label: string;
  live: boolean;
};

export function coverCaption(cover: Cover | null): string {
  if (!cover) return "the rcn mark";
  return cover.live ? `what's playing now: ${cover.label}` : `the last thing played: ${cover.label}`;
}

let cover: Cover | null = null;
let pinned = false;

export function currentCover(): Cover | null {
  return cover;
}

export function publishCover(next: Cover | null): void {
  if (import.meta.env?.DEV && pinned) return;
  if (next?.image === cover?.image && next?.label === cover?.label && next?.live === cover?.live) return;
  cover = next;
  document.dispatchEvent(new CustomEvent(COVER_EVENT));
}

export function pinCover(image: string): void {
  publishCover({ image, label: "test cover", live: true });
  pinned = true;
}
