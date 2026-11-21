const EVENT = "rcn:overlay-open";

export type OverlayName = "palette" | "settings";

export function overlayOpened(name: OverlayName) {
  document.dispatchEvent(new CustomEvent<OverlayName>(EVENT, { detail: name }));
}

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
