import { SMOOTH_TAU_MS } from "../../shared/multiplayer.ts";

/**
 * The parts of the cursor engine that are just arithmetic.
 *
 * multiplayer.ts is unavoidably tangled up in the DOM — sockets, animation
 * frames, elements — which makes it awkward to test and easy to get quietly
 * wrong. The decisions it makes are not tangled up in anything: where a cursor
 * belongs on screen, how far to move it this frame, how long to wait before
 * knocking again. Those live here, where they can be checked.
 */

/**
 * The content column, in document coordinates.
 *
 * Positions travel between people relative to this rather than to the
 * viewport. Two readers at different window widths would otherwise see each
 * other pointing at different paragraphs; the column is the one frame of
 * reference they share, so a cursor parked on a heading lands on that heading
 * at any width.
 */
export interface Column {
  left: number;
  top: number;
  /** Never zero — it is a divisor. */
  width: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Document coordinates → column space: x as a fraction of the column's width,
 * y as pixels below its top.
 *
 * x outside 0..1 is the margin either side, which is allowed — people do point
 * at things beside the text.
 */
export function toColumn(page: Point, column: Column): Point {
  return {
    x: (page.x - column.left) / column.width,
    y: page.y - column.top,
  };
}

/**
 * Column space → viewport coordinates. The inverse of toColumn, less the
 * scroll offset, since the cursor layer is fixed to the viewport while the
 * position it is drawing is anchored to the document.
 */
export function toScreen(position: Point, column: Column, scroll: Point): Point {
  return {
    x: column.left + position.x * column.width - scroll.x,
    y: column.top + position.y - scroll.y,
  };
}

/**
 * Slack around the viewport before a cursor stops being drawn. Generous on the
 * left, where a cursor's name label extends to the right of the arrow and
 * should not pop in halfway across the screen.
 */
const CULL_MARGIN = { left: 80, top: 40, right: 40, bottom: 40 } as const;

/** Whether a cursor at these viewport coordinates is worth compositing. */
export function onScreen(
  screen: Point,
  viewport: { width: number; height: number },
) {
  return (
    screen.x > -CULL_MARGIN.left &&
    screen.y > -CULL_MARGIN.top &&
    screen.x < viewport.width + CULL_MARGIN.right &&
    screen.y < viewport.height + CULL_MARGIN.bottom
  );
}

/**
 * One frame of exponential approach towards a target.
 *
 * Framerate-independent on purpose: a fixed step per frame would move a cursor
 * twice as fast on a 120 Hz screen as on a 60 Hz one, and would lurch whenever
 * a frame was dropped. Expressed against elapsed time, the curve is the same
 * shape everywhere.
 */
export function approach(
  from: number,
  to: number,
  dtMs: number,
  tauMs = SMOOTH_TAU_MS,
) {
  if (tauMs <= 0) return to;
  return from + (to - from) * (1 - Math.exp(-dtMs / tauMs));
}

export const RECONNECT_MIN_MS = 500;

/**
 * Ceiling on the reconnect backoff.
 *
 * Deliberately long. If the room Worker is down, or the network has gone, a
 * client that keeps knocking every fifteen seconds spends the rest of the
 * session writing failures into the console for something that is not coming
 * back on its own — and each attempt is a request. Five minutes still
 * self-heals without the noise, and the paths that suggest conditions have
 * actually changed reset the count so recovery stays prompt when someone is
 * there to notice.
 */
export const RECONNECT_MAX_MS = 5 * 60 * 1000;

/**
 * How many failed attempts before the UI stops implying everything is fine.
 * Four is roughly seven seconds of trying: past an ordinary blip, short of
 * making a momentary hiccup look like an outage.
 */
export const STALL_AFTER_ATTEMPTS = 4;

/** How long to wait before attempt number `attempt` (zero-based). */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.max(0, attempt));
}

/** Whether enough attempts have failed to be worth telling the reader about. */
export function isStalled(attempt: number): boolean {
  return attempt > STALL_AFTER_ATTEMPTS;
}
