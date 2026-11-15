/**
 * The lattice the rcn mark is drawn on: equilateral triangles with horizontal
 * bases, whose slanted edges lean right at 60°. The mark is nine sides wide
 * and three rows tall on it. Pure, so the placement rules test under node; the
 * shader in `shader.ts` restates the same coordinates in GLSL.
 */

/** Row height over side length: sin 60°. */
export const ROW = Math.sqrt(3) / 2;

/** The mark's size in lattice units: sides across, rows down. */
export const MARK_SIDES = 9;
export const MARK_ROWS = 3;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Where the mark sits in a field `w` by `h`, given the side of one cell.
 * `scale` cells make one of the mark's own triangles, so its edges land on
 * cell edges and it is drawn exactly. Its top edge starts a side and a half in
 * from its left, and every row shifts the lattice half a side, so the top row
 * must be odd when `scale` is and even when it is not. `inset` keeps the mark
 * that far from every edge of the field.
 */
export function placeMark(
  field: { w: number; h: number },
  cell: number,
  options: { share: number; alignX: number; alignY: number; inset?: number; maxScale?: number },
): Rect {
  const inset = options.inset ?? 0;
  const room = { w: field.w - inset * 2, h: field.h - inset * 2 };
  const widest = room.w * options.share;
  const scale = Math.min(options.maxScale ?? Infinity, Math.max(1, Math.floor(widest / (MARK_SIDES * cell))));
  const w = MARK_SIDES * scale * cell;
  const h = MARK_ROWS * scale * cell * ROW;

  const rowHeight = cell * ROW;
  const parity = scale % 2;
  const wanted = (inset + (room.h - h) * options.alignY) / rowHeight;
  const row = Math.max(parity, Math.round((wanted - parity) / 2) * 2 + parity);
  const column = Math.max(0, Math.round((inset + (room.w - w) * options.alignX) / cell));

  return { x: column * cell, y: row * rowHeight, w, h };
}

/**
 * The square a cover is drawn into. Wide fields hang it off the far edge and
 * let it dissolve towards the text; narrow ones (a phone) run it edge to edge
 * across the top and dissolve it downwards. A title block (`compact`) keeps
 * it to the far two fifths, clear of the heading and its links.
 */
export function placeCover(field: { w: number; h: number }, narrow: boolean, compact = false): Rect {
  if (narrow) {
    const side = field.w;
    return { x: 0, y: 0, w: side, h: side };
  }
  const side = Math.min(field.h, field.w * (compact ? 0.4 : 0.56));
  return { x: field.w - side, y: (field.h - side) / 2, w: side, h: side };
}
