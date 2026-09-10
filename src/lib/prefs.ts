/**
 * The settings-menu switches and their storage, shared by components that never
 * import each other. Keep it dependency-free: this lands in eager bundles.
 * Every read is guarded because private browsing throws.
 */

const EVENT = "rcn:pref";

export type PrefKey = "multiplayer" | "live" | "motion";

/** Reads a raw stored value. `null` means "never chosen", not "off". */
export function readPref(key: PrefKey): string | null {
  try {
    return localStorage.getItem(`rcn:${key}`);
  } catch {
    return null;
  }
}

/** Writes one, or clears it with `null`, and tells the page either way. */
export function writePref(key: PrefKey, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(`rcn:${key}`);
    else localStorage.setItem(`rcn:${key}`, value);
  } catch {
    // The choice will not survive the tab, but it still takes effect now.
  }

  document.dispatchEvent(new CustomEvent<PrefKey>(EVENT, { detail: key }));
}

/** Run `changed` whenever `key` is set, so a switch takes effect behind the panel. */
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

// --- Reduce motion ---

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The OS setting is the default; an explicit choice here wins either way. */
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

/** Stamps <html> for global.css. Duplicated inline in Layout.astro's head so
 * it lands before first paint. */
export function applyMotion() {
  document.documentElement.dataset.motion = motionReduced() ? "reduce" : "full";
}

// --- Live updates ---

/** On unless told otherwise. */
export function liveUpdates(): boolean {
  return readPref("live") !== "off";
}

export function setLiveUpdates(on: boolean) {
  writePref("live", on ? null : "off");
}
