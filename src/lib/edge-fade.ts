/**
 * Which edges of a horizontal scroller are cutting content off.
 *
 * Pulled out of the component because getting it wrong is easy and silent: a
 * fade on the right while scrolled to the right end draws a gradient over
 * nothing and leaves the genuinely hidden content on the left unmarked. That
 * is a bug you only notice by looking at the exact scroll position where it
 * matters, which makes it a much better unit test than a browser check.
 */
export type EdgeFade = { left: number; right: number };

/**
 * `size` is how far the fade extends, in pixels.
 *
 * The 1px tolerance is not decoration: fractional layout widths mean
 * `scrollLeft` never lands exactly on `scrollWidth - clientWidth` at a device
 * pixel ratio other than 1, so an exact comparison leaves a permanent sliver
 * of fade at the end of the travel.
 */
export function edgeFade(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  size = 32,
): EdgeFade {
  const overflow = scrollWidth - clientWidth;

  // Nothing hidden: no fade, whatever the scroll position claims to be.
  if (overflow <= 0) return { left: 0, right: 0 };

  const clamped = Math.max(0, Math.min(scrollLeft, overflow));

  return {
    left: clamped > 1 ? size : 0,
    right: clamped < overflow - 1 ? size : 0,
  };
}
