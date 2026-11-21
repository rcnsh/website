export const ROW = Math.sqrt(3) / 2;

export const MARK_SIDES = 9;
export const MARK_ROWS = 3;

export type Rect = { x: number; y: number; w: number; h: number };

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

export type CoverLayout = "wide" | "narrow" | "square" | "compact" | "band";

export const BAND_COVER_SHOWN = 0.65;
const BAND_COVER_ROOM = 0.7;
const SQUARE_COVER_ROOM = 0.52;

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

export const COVER_TEXELS_PER_SIDE = 4;
const COVER_TEXEL_STEP = 16;

export function coverTexels(rect: Rect, cell: number): number {
  const wanted = Math.ceil(((rect.w / cell) * COVER_TEXELS_PER_SIDE) / COVER_TEXEL_STEP) * COVER_TEXEL_STEP;
  return Math.min(512, Math.max(COVER_TEXEL_STEP, wanted));
}

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
