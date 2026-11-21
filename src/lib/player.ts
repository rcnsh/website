import { BUCKET_ORIGIN } from "../../shared/security.ts";
import { hasOwnerHint } from "./owner-hint.ts";
import {
  needsOwner,
  parseSavedPlayback,
  SAVED_PLAYBACK_KEY,
  type PlayerTrack,
  type SavedPlayback,
} from "./player-state.ts";

export type PlayerSnapshot = {
  track: PlayerTrack | null;
  paused: boolean;
  time: number;
  duration: number;
  failed: boolean;
  docked: boolean;
};

export const IDLE: PlayerSnapshot = {
  track: null,
  paused: true,
  time: 0,
  duration: 0,
  failed: false,
  docked: false,
};

const SEEK_STEP_SECONDS = 10;

let snapshot = IDLE;
const listeners = new Set<() => void>();
let media: HTMLVideoElement | null = null;
let floatHost: ShadowRoot | null = null;
let dockHost: HTMLElement | null = null;
let pendingSeek: number | null = null;

function update(patch: Partial<PlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function getSnapshot(): PlayerSnapshot {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mediaElement(): HTMLVideoElement | null {
  return media;
}

function element(): HTMLVideoElement {
  if (media) return media;
  const el = document.createElement("video");
  el.playsInline = true;
  el.preload = "metadata";
  Object.assign(el.style, { display: "block", width: "100%", height: "100%", objectFit: "contain" });
  el.addEventListener("play", () => update({ paused: false }));
  el.addEventListener("pause", () => update({ paused: true }));
  el.addEventListener("timeupdate", () => update({ time: el.currentTime }));
  el.addEventListener("durationchange", () =>
    update({ duration: Number.isFinite(el.duration) ? el.duration : 0 }),
  );
  el.addEventListener("loadedmetadata", () => {
    if (pendingSeek) el.currentTime = pendingSeek;
    pendingSeek = null;
  });
  el.addEventListener("error", () => update({ failed: true, paused: true }));
  media = el;
  return el;
}

function place(): void {
  if (dockHost && !dockHost.isConnected) dockHost = null;
  if (snapshot.docked !== (dockHost !== null)) update({ docked: dockHost !== null });
  const el = media;
  const host = dockHost ?? floatHost;
  if (!el) return;
  el.controls = dockHost !== null;
  if (!host || el.parentNode === host) return;
  const move = (host as { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  if (move && el.isConnected && host.isConnected) {
    try {
      move.call(host, el, null);
      return;
    } catch {
    }
  }
  host.appendChild(el);
}

export function play(track: PlayerTrack, at?: number): void {
  const el = element();
  if (snapshot.track?.key !== track.key || snapshot.failed) {
    load(track, at ?? 0, true);
  } else if (at !== undefined) {
    seek(at);
  }
  void el.play().catch(() => {
  });
  place();
}

function load(track: PlayerTrack, at: number, paused: boolean): void {
  const el = element();
  pendingSeek = at > 0 ? at : null;
  el.poster = track.kind === "video" ? (track.poster ?? "") : "";
  el.src = track.url;
  update({ track, paused, time: at, duration: 0, failed: false });
  syncSession();
}

export function toggle(): void {
  const el = media;
  const track = snapshot.track;
  if (!el || !track) return;
  if (snapshot.failed) play(track, snapshot.time);
  else if (el.paused) void el.play().catch(() => {});
  else el.pause();
}

export function seek(seconds: number): void {
  const el = media;
  if (!el || !snapshot.track) return;
  const at = Math.max(0, seconds);
  if (el.readyState < HTMLMediaElement.HAVE_METADATA) pendingSeek = at || null;
  else el.currentTime = at;
  update({ time: at });
}

function forgetSaved(): void {
  try {
    sessionStorage.removeItem(SAVED_PLAYBACK_KEY);
  } catch {
  }
}

export function stop(): void {
  const el = media;
  if (el) {
    el.pause();
    el.removeAttribute("src");
    el.removeAttribute("poster");
    el.load();
  }
  pendingSeek = null;
  forgetSaved();
  dockHost = null;
  update(IDLE);
  place();
  syncSession();
}

export function dock(host: HTMLElement, key: string): () => void {
  if (snapshot.track?.key !== key) return () => {};
  dockHost = host;
  place();
  return () => {
    if (dockHost !== host) return;
    dockHost = null;
    place();
  };
}

export function startPlayer(host: ShadowRoot): void {
  floatHost = host;
  restore();
  place();

  document.addEventListener("astro:before-swap", () => {
    if (!dockHost) return;
    dockHost = null;
    place();
  });
  addEventListener("pagehide", save);
  addEventListener("pageshow", (event) => {
    if (event.persisted) restore();
  });
}

function save(): void {
  try {
    if (!snapshot.track || snapshot.failed || !media) {
      sessionStorage.removeItem(SAVED_PLAYBACK_KEY);
      return;
    }
    const saved: SavedPlayback = {
      track: snapshot.track,
      time: pendingSeek ?? media.currentTime,
      paused: media.paused,
    };
    sessionStorage.setItem(SAVED_PLAYBACK_KEY, JSON.stringify(saved));
  } catch {
    forgetSaved();
  }
}

function restore(): void {
  let saved: SavedPlayback | null = null;
  try {
    saved = parseSavedPlayback(sessionStorage.getItem(SAVED_PLAYBACK_KEY), location.href, [
      location.origin,
      BUCKET_ORIGIN,
    ]);
  } catch {
    return;
  }
  if (saved && needsOwner(saved.track.url, location.href) && !hasOwnerHint()) saved = null;
  if (!saved) {
    if (snapshot.track) stop();
    else forgetSaved();
    return;
  }
  if (snapshot.track?.key === saved.track.key && !snapshot.failed) seek(saved.time);
  else load(saved.track, saved.time, true);
  if (saved.paused) media?.pause();
  else void element().play().catch(() => {});
  place();
}

let sessionBound = false;

function syncSession(): void {
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  const track = snapshot.track;
  session.metadata = track
    ? new MediaMetadata({
        title: track.title,
        artist: track.artist ?? "rcn.sh",
        artwork: track.poster && !track.poster.startsWith("data:") ? [{ src: track.poster }] : [],
      })
    : null;
  if (sessionBound) return;
  sessionBound = true;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => void media?.play().catch(() => {})],
    ["pause", () => media?.pause()],
    ["stop", stop],
    ["seekto", (details) => details.seekTime !== undefined && seek(details.seekTime)],
    ["seekbackward", (details) => seek(snapshot.time - (details.seekOffset ?? SEEK_STEP_SECONDS))],
    ["seekforward", (details) => seek(snapshot.time + (details.seekOffset ?? SEEK_STEP_SECONDS))],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
    }
  }
}
