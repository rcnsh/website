/**
 * The header opens two things that both want the whole screen's attention —
 * the command palette and the settings popover — from components that never
 * import each other. Left to themselves they stack: the palette lays a
 * backdrop over the page, the popover draws on top of it, and a visitor ends
 * up with two live dialogs and no clear thing for Escape to close.
 *
 * Rather than have either one reach into the other, whichever opens announces
 * itself, and everyone else closes on hearing a name that is not theirs. A
 * third overlay joins by calling these two functions.
 *
 * Only opening is announced, so a close can never provoke another close.
 */

const EVENT = "rcn:overlay-open";

export type OverlayName = "palette" | "settings";

/** Announce that `name` has just opened. */
export function overlayOpened(name: OverlayName) {
  document.dispatchEvent(new CustomEvent<OverlayName>(EVENT, { detail: name }));
}

/**
 * Close `name` whenever a different overlay opens. Bound to the caller's
 * AbortController, like every other listener in these components, so a view
 * transition retires it with the rest.
 */
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
