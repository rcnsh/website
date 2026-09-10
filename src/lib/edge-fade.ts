/** Which edges of a horizontal scroller are cutting content off. */
export type EdgeFade = { left: number; right: number };

/**
 * `size` is how far the fade extends, in pixels.
 *
 * 1px of tolerance: at a device pixel ratio other than 1, fractional layout
 * widths mean `scrollLeft` never lands exactly on the end of the travel.
 */
export function edgeFade(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  size = 32,
): EdgeFade {
  const overflow = scrollWidth - clientWidth;

  if (overflow <= 0) return { left: 0, right: 0 };

  const clamped = Math.max(0, Math.min(scrollLeft, overflow));

  return {
    left: clamped > 1 ? size : 0,
    right: clamped < overflow - 1 ? size : 0,
  };
}
