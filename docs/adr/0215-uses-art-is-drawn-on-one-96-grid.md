# 0215. Uses art is drawn on one 96x96 grid, with brand marks at half size

Every drawing in `src/components/uses/UsesArt.astro` is on a 96x96 viewBox. Physical objects are hand-drawn strokes. Software uses its simple-icons mark from `src/lib/brand-marks.ts`, a 24x24 path scaled 2x and translated (24,24) so it fills half the grid: a filled mark reads heavier than strokes, so it is drawn at half the grid to balance. Apps with no available mark are drawn by hand in UsesArt.

Drawings stay at the level of detail the size can carry. The Pixel is drawn from the back, with the camera island as an inset pill rather than an edge-to-edge bar: the island is the phone's identity, and the inset pill is what distinguishes this generation from the Pixel 6 through 8. The keyboard draws its rows as dashed strokes rather than individual keys, which would be noise at this size.

A name with neither a brand mark nor a hand drawing gets a dashed square with a dash, so a typo in site.json shows up rather than leaving a silent gap. The whole svg has `user-select: none`: the drawings are decoration, and dragging across the page should not pick up text drawn into one.
