import { DOWNLOAD_PATH } from "./thumbs.ts";

export type PlayerKind = "audio" | "video";

export type PlayerTrack = {
  key: string;
  url: string;
  title: string;
  artist?: string;
  kind: PlayerKind;
  poster?: string;
};

export type SavedPlayback = { track: PlayerTrack; time: number; paused: boolean };

export const SAVED_PLAYBACK_KEY = "rcn:player";

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

function allowedPoster(poster: string, base: string, origins: readonly string[]): boolean {
  return poster.startsWith("data:image/") || allowedUrl(poster, base, origins);
}
