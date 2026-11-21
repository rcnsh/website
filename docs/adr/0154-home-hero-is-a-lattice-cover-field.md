# 0154. The home hero draws the now-playing cover behind the name

The home hero in `src/pages/index.astro` is a `data-lattice="cover"` field: the page-wide canvas (`src/components/Lattice.astro`) draws the now-playing cover on the mark's triangle grid inside the section, with the text over the side it dissolves on, so the name stays legible over the cover. The name is `clamp(3.25rem, 9.2vw, 9.5rem)`, sized so the surname ends before the cover turns solid behind it.

Display text over the lattice (the hero name, page-band titles) carries `text-shadow: 0 0 0.35em var(--color-base)`. Where a letter crosses a lit triangle, the ground comes with it, so the letter stays legible.

Below 768px the hero has no min-height and the cover runs edge to edge across the top, and the text starts where the cover thins out. The phone `hero-frame` `padding-top` is `calc(22px + 88vw)`, matching the cover's inset below the header and its thin-out (`COVER_SOLID_Y`, `COVER_GONE_Y`), so the name starts on the cover's last thin scatter, which its text-shadow grounds. Change them together.
