const TRACK_LINK = /^https:\/\/open\.spotify\.com\/track\/([0-9A-Za-z]{22})(?:[?#]|$)/;

export function trackIdFromHref(href: string): string | null {
  return TRACK_LINK.exec(href)?.[1] ?? null;
}

export function isTrackId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z]{22}$/.test(value);
}
