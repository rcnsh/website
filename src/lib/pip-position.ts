// Where the floating player rests. It is dragged freely and, on release,
// settles in the corner its throw points at, the way system picture-in-picture
// does. Pure, so it tests under node.

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CORNERS: readonly Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

type Point = { x: number; y: number };
type Size = { width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/**
 * UIScrollView's normal deceleration. A throw at `v` px/s coasts
 * `v * rate / (1 - rate) / 1000` px, about half a second's worth.
 */
const DECELERATION = 0.998;

function coast(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

/** The corner nearest where the box would come to rest if let go at `velocity`. */
export function projectedCorner(position: Point, velocity: Point, box: Size, viewport: Size): Corner {
  const x = position.x + box.width / 2 + coast(velocity.x);
  const y = position.y + box.height / 2 + coast(velocity.y);
  const vertical = y < viewport.height / 2 ? "top" : "bottom";
  const horizontal = x < viewport.width / 2 ? "left" : "right";
  return `${vertical}-${horizontal}`;
}

/** The box's top-left in that corner, kept on screen when the box outgrows the viewport. */
export function cornerPosition(corner: Corner, box: Size, viewport: Size, insets: Insets): Point {
  const right = viewport.width - insets.right - box.width;
  const bottom = viewport.height - insets.bottom - box.height;
  return {
    x: corner.endsWith("left") ? insets.left : Math.max(insets.left, right),
    y: corner.startsWith("top") ? insets.top : Math.max(insets.top, bottom),
  };
}

export function isCorner(value: unknown): value is Corner {
  return typeof value === "string" && (CORNERS as readonly string[]).includes(value);
}

/**
 * Velocity from the last pointer samples, in px/s. Samples older than
 * `windowMs` before the newest are ignored, so a pause before letting go
 * reads as a drop, not a throw.
 */
export function releaseVelocity(samples: readonly (Point & { t: number })[], windowMs = 100): Point {
  const last = samples.at(-1);
  if (!last) return { x: 0, y: 0 };
  const first = samples.find((s) => last.t - s.t <= windowMs) ?? last;
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: ((last.x - first.x) / dt) * 1000, y: ((last.y - first.y) / dt) * 1000 };
}
