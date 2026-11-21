# 0192. Tailwind classes are written whole, unmerged, and overrides win by specificity

Tailwind generates only the classes it finds whole in the source, so a class chosen at runtime goes through a lookup of whole class names. `/uses` maps a plate's span through `SPAN_CLASS` (`col-span-5`, `col-span-6`, ...) in `src/pages/uses.astro`, never by building `col-span-${n}`.

Tailwind emits utilities in no guaranteed order. The utilities in `src/styles/global.css` that override `tile` (`tile-link`'s box, `page-hero`'s padding) are written as `&.tile` compounds, so the compound selector's specificity is what makes them win.

`cn()` in `src/lib/utils.ts` is plain clsx, without tailwind-merge. No component takes a `className` prop, so there is nothing to merge.
