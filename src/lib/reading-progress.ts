/**
 * The scroll decisions behind a post's "On this page" tile, kept apart from
 * the DOM so they can be tested — the preview harness never dispatches scroll.
 */

/**
 * Index of the heading the reader is in: the last one whose top has passed
 * `threshold` (px from the viewport top). -1 while still above the first.
 *
 * `atEnd` forces the last one: headings near the bottom of a post can never
 * scroll as high as the threshold, so they would otherwise never be marked.
 */
export function activeHeading(
  tops: readonly number[],
  threshold: number,
  atEnd = false,
): number {
  if (atEnd && tops.length > 0) return tops.length - 1;
  let active = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= threshold) active = i;
    else break;
  }
  return active;
}

/**
 * How far through the body the reader is, 0 to 1: 0 until its top reaches
 * the viewport top, 1 once its bottom reaches the viewport bottom.
 */
export function readingProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, -top / travel));
}
