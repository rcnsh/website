import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoEqualEarth, geoPath } from "d3-geo";
import isoCountries from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json" with { type: "json" };
import detailed from "world-atlas/countries-50m.json" with { type: "json" };

/**
 * Projects Natural Earth's 110m country outlines once and writes them to
 * src/lib/world.ts as flat SVG path data.
 *
 * Run by hand (`npm run world`), not by the build: the coastlines change about
 * as often as the coastlines do. Committing the output keeps d3-geo and
 * topojson out of the Worker entirely — at request time the map is a lookup
 * from country code to a string, and the only work left is choosing fills.
 *
 * Equal Earth because a choropleth compares areas, and Mercator would hand
 * Greenland the visual weight of Africa.
 *
 * 110m for the outlines, because the whole map is inlined into the guestbook
 * response and the 50m set is four times the bytes. But 110m has no polygon
 * at all for the smallest countries — Singapore among them, which is where
 * this site's author currently lives. So 50m is loaded purely to take their
 * centroids: those countries ship as a marker with no outline, and the map
 * draws them as a dot. Nothing here is a hand-typed coordinate.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/lib/world.ts");

/** Viewport of the generated SVG. Tuned to the projection's 2.05:1 aspect. */
const WIDTH = 820;
const HEIGHT = 400;

/**
 * world-atlas keys countries by ISO 3166-1 *numeric*; `request.cf.country`
 * gives alpha-2. Node's ICU data carries no numeric mapping, and a hand-written
 * crosswalk quietly loses whichever countries it forgot — so the full table
 * comes from the ISO registry instead. Dev-only: this never reaches the Worker.
 *
 * The handful of Natural Earth polygons with no ISO code (Kosovo, disputed
 * areas) come back null, and are drawn as background that never lights up.
 */
const alpha2For = (numeric: string): string | null =>
  isoCountries.numericToAlpha2(numeric) ?? null;

/**
 * Antarctica: a wide strip along the bottom edge that no one will ever sign
 * from, costing the map a fifth of its height. Checked in both passes — the
 * marker pass would otherwise put it straight back as a dot.
 */
const SKIP_NUMERIC = new Set(["010"]);

type Country = { id: string; name: string };

async function main() {
  const topology = atlas as unknown as Topology;
  const collection = feature(
    topology,
    topology.objects.countries!,
  ) as unknown as GeoJSON.FeatureCollection;

  // fitSize once over the whole collection, so every path shares one transform.
  const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], collection);

  /*
    One decimal place. The map is 820px across and scales down from there, so
    the second decimal is a hundredth of a pixel — it costs about 70 KB of
    Worker bundle to render nothing at all.
  */
  const toPath = geoPath(projection).digits(1);

  const shapes: string[] = [];
  const drawn = new Set<string>();
  let placed = 0;
  const round = (n: number) => Math.round(n * 10) / 10;

  for (const country of collection.features) {
    const numeric = String(country.id ?? "").padStart(3, "0");

    if (SKIP_NUMERIC.has(numeric)) continue;

    const d = toPath(country);
    if (!d) continue;

    const code = alpha2For(numeric);
    if (code) {
      placed += 1;
      drawn.add(code);
    }

    const { name } = (country.properties ?? {}) as Partial<Country>;

    /*
      Projected area and centroid, so the map can mark a country too small to
      see. Singapore is a handful of square pixels at this size — without a
      dot it would be lit and still invisible, and the caption would count a
      country the reader cannot find.
    */
    const [cx, cy] = toPath.centroid(country);
    const area = toPath.area(country);

    shapes.push(
      `  { code: ${code ? JSON.stringify(code) : "null"}, name: ${JSON.stringify(
        name ?? "",
      )}, area: ${round(area)}, cx: ${round(cx ?? 0)}, cy: ${round(cy ?? 0)}, d: ${JSON.stringify(d)} },`,
    );
  }

  /*
    Countries the 110m set has no polygon for. They get a centroid from 50m and
    an empty `d` — the map renders them as a dot and nothing else. Without this
    a signature from Singapore, Malta or Bahrain would be counted in the
    caption and be nowhere on the map.
  */
  const fine = feature(
    detailed as unknown as Topology,
    (detailed as unknown as Topology).objects.countries!,
  ) as unknown as GeoJSON.FeatureCollection;

  const markers: string[] = [];

  for (const country of fine.features) {
    const numeric = String(country.id ?? "").padStart(3, "0");
    if (SKIP_NUMERIC.has(numeric)) continue;

    const code = alpha2For(numeric);
    if (!code || drawn.has(code)) continue;

    const [cx, cy] = toPath.centroid(country);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const { name } = (country.properties ?? {}) as Partial<Country>;

    drawn.add(code);
    placed += 1;
    markers.push(
      `  { code: ${JSON.stringify(code)}, name: ${JSON.stringify(
        name ?? code,
      )}, area: 0, cx: ${round(cx)}, cy: ${round(cy)}, d: "" },`,
    );
  }

  shapes.push(...markers);

  /*
    Anything Cloudflare could report that neither atlas draws would silently
    never light up. Most are territories Natural Earth folds into a parent
    (French Guiana into France) or tiny dependencies — worth seeing, not worth
    failing over.
  */
  // getAlpha2Codes() maps alpha-2 to alpha-3, so the codes are the keys.
  const missing = Object.keys(isoCountries.getAlpha2Codes()).filter(
    (code) => !drawn.has(code) && code !== "AQ",
  );
  if (missing.length > 0) {
    console.warn(
      `[world] ${missing.length} codes with no geometry: ${missing.sort().join(" ")}`,
    );
  }

  const source = `// Generated by scripts/generate-world.ts — do not edit by hand.
// Regenerate with \`npm run world\` after changing the projection or size.

/** One country outline, already projected into the ${WIDTH}x${HEIGHT} viewBox. */
export type WorldShape = {
  /** ISO 3166-1 alpha-2, or null where Natural Earth has no ISO code. */
  code: string | null;
  name: string;
  /** Projected area in square px — below TINY_AREA, draw a dot instead. */
  area: number;
  /** Projected centroid, for that dot. */
  cx: number;
  cy: number;
  /** SVG path data, or "" for a country too small for the 110m set to carry. */
  d: string;
};

/**
 * Under this many square px a filled country reads as noise or nothing at all.
 * Singapore lands around 1, Luxembourg around 20; Belgium, the smallest shape
 * that still reads as a shape, is comfortably above it.
 */
export const TINY_AREA = 45;

export const WORLD_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}" as const;
export const WORLD_SIZE = { width: ${WIDTH}, height: ${HEIGHT} } as const;

export const WORLD_SHAPES: readonly WorldShape[] = [
${shapes.join("\n")}
];
`;

  await writeFile(OUT, source);

  const kb = Math.round(Buffer.byteLength(source) / 1024);
  console.log(
    `[world] ${shapes.length} outlines, ${placed} with an ISO code — ${kb} KB to src/lib/world.ts`,
  );
}

await main();
