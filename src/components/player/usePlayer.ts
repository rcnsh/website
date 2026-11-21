import { useSyncExternalStore } from "react";
import { getSnapshot, IDLE, type PlayerSnapshot, subscribe } from "@/lib/player";

export function usePlayer(): PlayerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}

export function usePlayerValue<T>(select: (snapshot: PlayerSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => select(getSnapshot()), () => select(IDLE));
}
