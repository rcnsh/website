// What the site-wide player is playing, and the copy of it that crosses a full
// page load. Pure, so it tests under node; src/lib/player.ts owns the element.

import { DOWNLOAD_PATH } from "./thumbs.ts";

export type PlayerKind = "audio" | "video";

export type PlayerTrack = {
  /** Bucket key; the player's identity for a file. */
  key: string;
  url: string;
  title: string;
  artist?: string;
  kind: PlayerKind;
  poster?: string;
};

export type SavedPlayback = { track: PlayerTrack; time: number; paused: boolean };

export const SAVED_PLAYBACK_KEY = "rcn:player";

/**
 * Reads the copy written before a full page load (an SSR page, a reload).
 * Anything malformed is dropped, as is a media URL from any origin but
 * `origins`, so a stale or edited entry cannot point the player elsewhere.
 */
export function parseSavedPlayback(
  raw: string | null,
  base: string,
  origins: readonly string[],
): SavedPlayback | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.track)) return null;
  const { track, time, paused } = value;
  const { key, url, title, artist, kind, poster } = track;
  if (typeof key !== "string" || !key) return null;
  if (typeof url !== "string" || !allowedUrl(url, base, origins)) return null;
  if (typeof title !== "string") return null;
  if (kind !== "audio" && kind !== "video") return null;
  return {
    track: {
      key,
      url,
      title,
      kind,
      ...(typeof artist === "string" && artist ? { artist } : {}),
      ...(typeof poster === "string" && allowedPoster(poster, base, origins) ? { poster } : {}),
    },
    time: typeof time === "number" && Number.isFinite(time) && time > 0 ? time : 0,
    paused: paused !== false,
  };
}

/**
 * A private file, played through the owner-only route. Its saved copy is
 * dropped once the owner has signed out, so the box does not go on showing
 * the file's name to whoever has the tab next.
 */
export function needsOwner(url: string, base: string): boolean {
  try {
    return new URL(url, base).pathname === DOWNLOAD_PATH;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function allowedUrl(url: string, base: string, origins: readonly string[]): boolean {
  try {
    const { origin, protocol } = new URL(url, base);
    return (protocol === "https:" || protocol === "http:") && origins.includes(origin);
  } catch {
    return false;
  }
}

/** Posters drawn in the browser are data URLs; those are images and nothing else. */
function allowedPoster(poster: string, base: string, origins: readonly string[]): boolean {
  return poster.startsWith("data:image/") || allowedUrl(poster, base, origins);
}
