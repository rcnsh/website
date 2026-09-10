import { SMOOTH_TAU_MS } from "../../shared/multiplayer.ts";

/**
 * The parts of the cursor engine that are just arithmetic, split out of the
 * DOM-bound multiplayer.ts so they can be tested.
 */

/**
 * The content column, in document coordinates. Positions travel relative to it
 * rather than the viewport, so a cursor on a heading lands there at any width.
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
 * Document coordinates → column space: x as a fraction of the width, y as
 * pixels below the top. x outside 0..1 is the margins, which is allowed.
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

/** Slack before a cursor stops being drawn. Generous left, for the name label. */
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
 * One frame of exponential approach towards a target. Against elapsed time,
 * not per frame, so the curve is the same shape at 60 Hz and 120.
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
 * Ceiling on the reconnect backoff. Deliberately long — a client knocking
 * every fifteen seconds at something that is not coming back is all cost.
 * revive() resets the count when conditions plausibly changed.
 */
export const RECONNECT_MAX_MS = 5 * 60 * 1000;

/** Failed attempts before the UI admits to it. Four is about seven seconds. */
export const STALL_AFTER_ATTEMPTS = 4;

/**
 * How long to wait before attempt number `attempt` (zero-based).
 *
 * Jittered, because the exponential alone is synchronised: every client that
 * was connected when a room Worker went down computes the same delay from the
 * same attempt count, so they all come back in the same millisecond and knock
 * it over again.
 *
 * Equal jitter — a pick from [ceiling/2, ceiling) — rather than full jitter
 * from [0, ceiling). Full jitter disperses better but halves the *expected*
 * total wait and has no useful lower bound, which collides with the other
 * promise this backoff makes: `isStalled` reports a broken connection to the
 * reader only after STALL_AFTER_ATTEMPTS, and that is supposed to take several
 * seconds so a momentary hiccup is never shown as a broken feature. Under full
 * jitter that total sometimes came in under five seconds. Halving the window
 * still breaks lockstep; giving up the floor was the part that cost something.
 *
 * `random` is injected so the tests can assert the envelope exactly rather
 * than sampling and hoping; production passes nothing and gets Math.random.
 */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_MIN_MS * 2 ** Math.max(0, attempt),
  );

  // Half the ceiling, plus a random share of the other half.
  const jittered = ceiling / 2 + (ceiling / 2) * random();

  // Never below the floor, whatever the RNG does.
  return Math.max(RECONNECT_MIN_MS, Math.round(jittered));
}

/** Whether enough attempts have failed to be worth telling the reader about. */
export function isStalled(attempt: number): boolean {
  return attempt > STALL_AFTER_ATTEMPTS;
}
