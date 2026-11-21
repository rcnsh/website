# 0197. The logo is plain data, with a viewBox cropped to the mark

`src/lib/logo.ts` holds the mark as plain data, with no `@/` imports and no Astro dependencies, because bare Node loads it through `scripts/generate-badge.ts`, which cannot resolve `@/` aliases. `public/favicon.svg` carries its own copy of the shapes: the favicon is fetched as a static file before any code runs, so it cannot be generated from this module at request time.

`src/components/Logo.astro` crops the SVG's viewBox to the mark's real bounds, about 3.46:1, and sizes it by height with width auto. With the full 1080 square viewBox, a height such as `h-8` would mean eight units of mostly empty canvas rather than of logo. The plate variant keeps the full 1080 square.
