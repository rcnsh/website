/**
 * The command palette and the settings popover both want the whole screen, and
 * never import each other. Whichever opens announces itself; everyone else
 * closes on hearing a name that is not theirs.
 *
 * Only opening is announced, so a close cannot provoke another close.
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
