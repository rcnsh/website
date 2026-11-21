# 0128. Stats chart colours are validated and keyed by identity, not position

Line charts on `/music/stats` assign each series a colour that belongs to what it stands for, so a colour never changes meaning between views.

Era styles live once, in `ERA_STYLE` (`src/lib/music-stats-view.ts`): `var(--color-brand)` for Newcastle and `#c08050` for Singapore. `TimeOfDayPanel` (`src/components/music/stats/TimeOfDayPanel.astro`) looks them up by era key through `eraStyle`, and `Eras` (`src/components/music/stats/Eras.astro`) draws its before and after dots from the same entries, so the two charts cannot drift apart. A single year may hold only one of the eras, so assignment by position would give the wrong colour. The Singapore line is also dashed (`6 4`), so the eras never differ by colour alone.

`TopOverTime` (`src/components/music/stats/TopOverTime.astro`) assigns `SERIES` colours (brand, `#d95926`, `#199e70`, `#c98500`, `#d55181`, `#008300`, `#3987e5`) in a fixed order to artists in the order the warehouse returns them. The warehouse orders leaders by when they peaked, so a colour belongs to an artist and never to a rank.

Both palettes are checked with the dataviz palette validator against the tile surface (`#131311`): the two era colours stay distinct under every colour-vision deficiency, every adjacent `SERIES` pair clears the colour-blind and normal-vision floors, and every colour has at least 3:1 contrast.
