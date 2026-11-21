import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoEqualEarth, geoPath } from "d3-geo";
import isoCountries from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json" with { type: "json" };
import detailed from "world-atlas/countries-50m.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/lib/world.ts");

const WIDTH = 820;
const HEIGHT = 400;

const alpha2For = (numeric: string): string | null =>
  isoCountries.numericToAlpha2(numeric) ?? null;

const SKIP_NUMERIC = new Set(["010"]);

type Country = { id: string; name: string };

async function main() {
  const topology = atlas as unknown as Topology;
  const collection = feature(
    topology,
    topology.objects.countries!,
  ) as unknown as GeoJSON.FeatureCollection;

  const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], collection);

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

    const [cx, cy] = toPath.centroid(country);
    const area = toPath.area(country);

    shapes.push(
      `  { code: ${code ? JSON.stringify(code) : "null"}, name: ${JSON.stringify(
        name ?? "",
      )}, area: ${round(area)}, cx: ${round(cx ?? 0)}, cy: ${round(cy ?? 0)}, d: ${JSON.stringify(d)} },`,
    );
  }

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

  const missing = Object.keys(isoCountries.getAlpha2Codes()).filter(
    (code) => !drawn.has(code) && code !== "AQ",
  );
  if (missing.length > 0) {
    console.warn(
      `[world] ${missing.length} codes with no geometry: ${missing.sort().join(" ")}`,
    );
  }

  const source = `export type WorldShape = {
  code: string | null;
  name: string;
  area: number;
  cx: number;
  cy: number;
  d: string;
};

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
