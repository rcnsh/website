/**
 * The rcn.sh mark as data. No `@/` imports and nothing Astro-shaped: bare Node
 * loads this through scripts/generate-badge.ts. public/favicon.svg carries its
 * own copy, since it is fetched before any of this runs.
 */

export type LogoPolygon = { fill: string; points: string };

/** Cropped to the glyph's real bounds, so height means height of mark. */
export const LOGO_VIEWBOX = "132.33 422.31 815.34 235.38";

/** The full square, for the plate variant the favicon and app icons use. */
export const LOGO_PLATE_VIEWBOX = "0 0 1080 1080";

/** Width ÷ height of LOGO_VIEWBOX, ≈3.46. Size by height and derive width. */
export const LOGO_ASPECT = 815.34 / 235.38;

/** The dark rounded plate behind the glyph. */
export const LOGO_PLATE = "#181818";

export const LOGO_POLYGONS: LogoPolygon[] = [
  {
    fill: "#5b66af",
    points:
      "947.67 500.78 902.38 579.22 857.08 657.67 766.48 657.67 811.77 579.22 857.07 500.78 766.48 500.78 721.19 579.22 675.88 657.67 585.3 657.67 630.59 579.22 539.99 579.22 585.28 500.78 675.88 500.78 675.88 500.76 721.17 422.31 902.38 422.31 902.38 422.33 947.67 500.78",
  },
  {
    fill: "#305b99",
    points:
      "494.7 500.78 449.41 579.22 494.7 657.67 494.7 657.69 404.1 657.69 404.1 657.67 358.81 579.22 404.1 500.78 313.52 500.78 268.23 579.22 222.92 657.69 132.33 657.69 177.62 579.24 177.64 579.22 222.93 500.78 268.23 422.33 268.23 422.31 539.99 422.31 494.7 500.78",
  },
];

/** The two blues lifted for a dark ground, in polygon order; the mark's own
 * #305b99 is ~2.5:1 on the badge plate. */
export const LOGO_LIFTED = ["#7f8ad0", "#6f9bd8"] as const;

/** Standalone SVG at an explicit size; satori takes only an `<img>`, so
 * badge.ts passes this as a data URI. `fills` overrides in polygon order. */
export function logoSvg(
  height: number,
  fills: readonly string[] = LOGO_POLYGONS.map((polygon) => polygon.fill),
): string {
  const width = height * LOGO_ASPECT;
  const shapes = LOGO_POLYGONS.map(
    (polygon, index) =>
      `<polygon fill="${fills[index] ?? polygon.fill}" points="${polygon.points}"/>`,
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${LOGO_VIEWBOX}">${shapes}</svg>`;
}
