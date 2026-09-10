/**
 * Full-screen overlays that never import each other. Whichever opens announces
 * itself; the rest close. Only opening is announced, so a close cannot cascade.
 */

const EVENT = "rcn:overlay-open";

export type OverlayName = "palette" | "settings";

/** Announce that `name` has just opened. */
export function overlayOpened(name: OverlayName) {
  document.dispatchEvent(new CustomEvent<OverlayName>(EVENT, { detail: name }));
}

/** Close `name` whenever a different overlay opens. */
export function closeOnOtherOverlay(
  name: OverlayName,
  close: () => void,
  signal: AbortSignal,
) {
  document.addEventListener(
    EVENT,
    (event) => {
      if ((event as CustomEvent<OverlayName>).detail !== name) close();
    },
    { signal },
  );
}
