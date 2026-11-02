import { useSyncExternalStore } from "react";
import { getSnapshot, IDLE, type PlayerSnapshot, subscribe } from "@/lib/player";

/** The site-wide player's state, re-rendering on every change (time included). */
export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}

/**
 * One value from the player's state, re-rendering only when it changes.
 * `select` must return a primitive, or a new object would re-render forever.
 */
export function usePlayerValue<T>(select: (snapshot: PlayerSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => select(getSnapshot()), () => select(IDLE));
}
