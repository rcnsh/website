# 0141. The five levels are read from the palette tokens

At start the field (`src/lib/lattice/field.ts`) reads `--color-raised`, `--color-brand-deep` and `--color-brand` and builds its five levels as raised, raised→deep at 0.4 and at 0.65, deep, and brand. The field and the contribution graph (`src/components/widgets/Contributions.astro`) thus share one palette, and colours change in `global.css` only. The field blends linearly in sRGB while the graph uses `color-mix` in oklab, so the middle two levels are close, not identical.

The field parses these custom properties as six-digit `#rrggbb` only. Every colour token in `global.css` is six-digit hex; a token written another way (`#rgb`, `rgb()`, `oklch`) would parse wrongly, so the tokens the field reads must stay six-digit hex.
