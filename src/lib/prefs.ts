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

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function motionReduced(): boolean {
  const stored = readPref("motion");
  if (stored === "reduce") return true;
  if (stored === "full") return false;
  return matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function setMotionReduced(reduce: boolean) {
  writePref("motion", reduce ? "reduce" : "full");
  applyMotion();
}

export function applyMotion() {
  document.documentElement.dataset.motion = motionReduced() ? "reduce" : "full";
}

export function liveUpdates(): boolean {
  return readPref("live") !== "off";
}

export function setLiveUpdates(on: boolean) {
  writePref("live", on ? null : "off");
}
