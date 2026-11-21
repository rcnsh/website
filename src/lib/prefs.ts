import { REDUCED_MOTION_QUERY, resolveMotion } from "../../shared/motion.ts";

const EVENT = "rcn:pref";

export type PrefKey = "live" | "motion";

export function readPref(key: PrefKey): string | null {
  try {
    return localStorage.getItem(`rcn:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: PrefKey, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(`rcn:${key}`);
    else localStorage.setItem(`rcn:${key}`, value);
  } catch {
  }

  document.dispatchEvent(new CustomEvent<PrefKey>(EVENT, { detail: key }));
}

export function onPrefChange(
  key: PrefKey,
  changed: () => void,
  signal?: AbortSignal,
) {
  document.addEventListener(
    EVENT,
    (event) => {
      if ((event as CustomEvent<PrefKey>).detail === key) changed();
    },
    { signal },
  );
}

export { REDUCED_MOTION_QUERY };

function currentMotion() {
  return resolveMotion(readPref("motion"), matchMedia(REDUCED_MOTION_QUERY).matches);
}

export function motionReduced(): boolean {
  return currentMotion() === "reduce";
}

export function setMotionReduced(reduce: boolean) {
  writePref("motion", reduce ? "reduce" : "full");
  applyMotion();
}

export function applyMotion() {
  document.documentElement.dataset.motion = currentMotion();
}

export function liveUpdates(): boolean {
  return readPref("live") !== "off";
}

export function setLiveUpdates(on: boolean) {
  writePref("live", on ? null : "off");
}
