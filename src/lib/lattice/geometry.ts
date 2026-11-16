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
 * How a cover sits in its field. `wide`: the home field, hung off the far
 * edge. `narrow`: a phone's home field, edge to edge across the top.
 * `square`: a title band on a phone, the whole square in its top corner.
 * `compact`: a short home field (a landscape phone), the far two fifths.
 * `band`: a title band from a tablet up, see `BAND_COVER_SHOWN`.
 */
export type CoverLayout = "wide" | "narrow" | "square" | "compact" | "band";

/**
 * How much of a cover's height a title band shows. The band is short and
 * wide, so a whole square in it was a thumbnail in the corner; the square is
 * grown until the band's own edges crop it to this middle strip, which keeps
 * the texture square. Less and a subject off the middle is lost (Late
 * Registration's bear already is); more and the picture narrows to a tile.
 */
export const BAND_COVER_SHOWN = 0.65;
/** The widest a band's cover may get, as a share of the frame, clear of the title. */
const BAND_COVER_ROOM = 0.7;
/** A phone band's square, as a share of the frame: past the title, short of the edge. */
const SQUARE_COVER_ROOM = 0.52;

/**
 * The square a cover is drawn into. `inset` is the page frame's margin, which
 * a band's cover keeps its far edge to, in line with the tiles below it, and
 * a phone's home cover keeps below the header. `foot` is the height of the
 * row of links or figures along a band's foot, which a `square` stays above.
 */
export function placeCover(field: { w: number; h: number }, layout: CoverLayout, inset = 0, foot = 0): Rect {
  if (layout === "narrow") {
    const side = field.w;
    return { x: 0, y: inset, w: side, h: side };
  }
  if (layout === "square") {
    const side = Math.max(1, Math.min((field.w - inset * 2) * SQUARE_COVER_ROOM, field.h - inset - foot));
    return { x: field.w - inset - side, y: inset, w: side, h: side };
  }
  if (layout === "band") {
    const side = Math.min(field.h / BAND_COVER_SHOWN, (field.w - inset * 2) * BAND_COVER_ROOM);
    return { x: field.w - inset - side, y: (field.h - side) / 2, w: side, h: side };
  }
  const side = Math.min(field.h, field.w * (layout === "compact" ? 0.4 : 0.56));
  return { x: field.w - side, y: (field.h - side) / 2, w: side, h: side };
}

/** Texels along one triangle's side in a cover's texture. */
export const COVER_TEXELS_PER_SIDE = 4;
const COVER_TEXEL_STEP = 16;

/**
 * How many texels square a cover's texture is, so its resolution follows the
 * lattice that draws it: a few texels to a triangle's side, whatever the cell
 * or the cover's size on screen. Coarser and a triangle's taps blur into its
 * neighbours; finer and they skip pixels between them.
 */
export function coverTexels(rect: Rect, cell: number): number {
  // In steps, so dragging a window's edge redraws the texture every few
  // dozen pixels, not on every frame.
  const wanted = Math.ceil(((rect.w / cell) * COVER_TEXELS_PER_SIDE) / COVER_TEXEL_STEP) * COVER_TEXEL_STEP;
  return Math.min(512, Math.max(COVER_TEXEL_STEP, wanted));
}

/**
 * Where a triangle reads its picture, as barycentric weights of its three
 * corners: the centroids of the `n * n` equal triangles it splits into when
 * each side is cut into `n`. Equal areas, so the plain mean of the reads is
 * the picture's mean over the whole triangle.
 */
export function triangleTaps(n: number): [number, number, number][] {
  const taps: [number, number, number][] = [];
  for (let a = 0; a < n; a++) {
    for (let b = 0; a + b < n; b++) {
      const c = n - 1 - a - b;
      taps.push([(a + 1 / 3) / n, (b + 1 / 3) / n, (c + 1 / 3) / n]);
      if (c > 0) taps.push([(a + 2 / 3) / n, (b + 2 / 3) / n, (c - 1 / 3) / n]);
    }
  }
  return taps;
}
