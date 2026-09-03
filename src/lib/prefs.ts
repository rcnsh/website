/**
 * The switches in the settings menu, and the storage behind them. Four
 * components read these without importing each other, so both the value and
 * the change announcement live here.
 *
 * Dependency-free and small — this lands in eager bundles. Every read is
 * guarded: private browsing throws, and every default is "behave as the site
 * did before there was a switch".
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

/**
 * Run `changed` whenever `key` is set, so a switch takes effect behind the
 * panel. Bound to the caller's signal, so a view transition retires it.
 */
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

/**
 * Whether to cut animation. The OS setting is the default; an explicit choice
 * here wins in either direction, since not everyone controls their OS setting.
 */
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

/**
 * Stamps the answer on <html>, where global.css reads it. Duplicated inline in
 * the document head so it lands before first paint — see Layout.astro.
 */
export function applyMotion() {
  document.documentElement.dataset.motion = motionReduced() ? "reduce" : "full";
}

// --- Live updates ---

/** Whether the clock and now-playing poll keep running. On unless told otherwise. */
export function liveUpdates(): boolean {
  return readPref("live") !== "off";
}

export function setLiveUpdates(on: boolean) {
  writePref("live", on ? null : "off");
}
