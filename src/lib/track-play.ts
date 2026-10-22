const TRACK_LINK = /^https:\/\/open\.spotify\.com\/track\/([0-9A-Za-z]{22})(?:[?#]|$)/;

export function trackIdFromHref(href: string): string | null {
  return TRACK_LINK.exec(href)?.[1] ?? null;
}

export function isTrackId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z]{22}$/.test(value);
}

/** A click that asks for the default: not a new tab, window or download. */
export function isPlainClick(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
