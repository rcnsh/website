# 0096. The world map is projected once into a committed module

The guestbook map needs country outlines in SVG path form. `npm run world` (`scripts/generate-world.ts`) projects Natural Earth outlines from `world-atlas` once and writes the result to `src/lib/world.ts`, which is committed. That keeps `d3-geo` and `topojson-client` out of the Worker. `src/lib/world.ts` is generated output and never edited by hand, because a regeneration overwrites it; rerun `npm run world` after changing the projection or the size. The generator's template also emits `TINY_AREA` (45), `WORLD_VIEWBOX` and `WORLD_SIZE`.

The projection is Equal Earth, because a choropleth compares areas. Outlines come from the 110m set, because the map is inlined into the page (about 126 KB of `world.ts`). A single `fitSize` over the whole collection fits it into an 820x400 viewport, so every path shares one transform, and 820x400 matches the projection's 2.05:1 aspect. Path data and centroids are rounded to one decimal place (`geoPath(...).digits(1)`): a second decimal place is a hundredth of a pixel and costs about 70 KB.

Shapes are keyed by ISO 3166-1 alpha-2, converted from world-atlas's ISO numeric ids with `i18n-iso-countries`, because the signer's country comes from `request.cf.country`, which is alpha-2. A shape with no ISO code gets `code: null` and draws as inert background. Antarctica (numeric `010`, `SKIP_NUMERIC`) is skipped in both the 110m and 50m passes: it takes a fifth of the map's height and nobody signs from it.

## Consequences

Countries the 110m set has no polygon for, such as Singapore, Malta and Bahrain, which have signed, are emitted from a 50m pass with their centroid, `area: 0` and an empty `d`, and the map draws them as a dot; without the 50m centroid they could never light up. The generator then warns, rather than failing, about ISO codes that neither atlas draws (excluding `AQ`). Such a code would silently never light up, but they are mostly territories folded into a parent, so failing the generation would be too strict.
