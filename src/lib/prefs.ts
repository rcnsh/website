/**
 * The switches in the settings menu, and the storage behind them.
 *
 * Four things read these — the menu that sets them, the clock, the now-playing
 * island and the cursor layer — and none of them import each other, so both
 * the value and the announcement that it changed live here.
 *
 * Deliberately free of dependencies and deliberately small: ClockTile and the
 * React island both pull this into their eager bundles, and neither should pay
 * more than a few hundred bytes for the privilege of honouring a preference.
 *
 * Every read is guarded. Private browsing throws on the first localStorage
 * access rather than returning null, and a preference that cannot be stored is
 * not worth taking a page down for — the defaults below are all "behave the
 * way the site did before there was a switch", so failing to read one is
 * indistinguishable from never having touched it.
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
    // Nothing to do — the choice simply will not survive the tab. It still
    // takes effect now, which is the part the reader asked for.
  }

  document.dispatchEvent(new CustomEvent<PrefKey>(EVENT, { detail: key }));
}

/**
 * Run `changed` whenever `key` is set, so a switch takes effect on the page
 * behind the panel rather than on the next navigation. Bound to the caller's
 * AbortController, like every other listener in these components, so a view
 * transition retires it with the rest.
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
 * Whether animation should be cut, taking the OS setting as the default and
 * letting an explicit choice here win in either direction.
 *
 * Both directions matter. Someone on a machine whose accessibility settings
 * are not theirs to change — a work laptop, a library, a borrowed desk — has
 * no other way to turn motion down, and someone whose OS says "reduce" for
 * reasons that have nothing to do with this page can turn it back up.
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
 * Stamps the effective answer on <html>, which is where global.css reads it.
 *
 * The same three lines run inline in the document head before anything paints
 * — see the note in Layout.astro for why that copy has to exist.
 */
export function applyMotion() {
  document.documentElement.dataset.motion = motionReduced() ? "reduce" : "full";
}

// --- Live updates ---

/**
 * Whether the clock and the now-playing poll should keep running. On unless
 * someone has said otherwise, because a page that quietly stops updating is a
 * worse default than one that costs a request every twenty seconds.
 */
export function liveUpdates(): boolean {
  return readPref("live") !== "off";
}

export function setLiveUpdates(on: boolean) {
  writePref("live", on ? null : "off");
}
