# 0098. Map fill encodes the count by opacity over one accent colour

Signed countries on `GuestbookMap.astro` share one accent fill (`--color-brand`) with opacity `0.4 + 0.6 * count / busiest` (`opacityFor`). Depth carries the count, and the 0.4 floor keeps a single signature visibly lit, because the difference that reads is "someone" versus "no one".

Outlines use hairline strokes (`stroke-width: 0.4`, `vector-effect: non-scaling-stroke`), matching every other divider and leaving the fill to carry meaning. A signed country smaller than `TINY_AREA`, or one with no polygon, also gets a 3.5px dot at full strength, because at that size an opacity difference cannot be read. Dots are rendered after all outlines: SVG paints in order, so they sit on top, and for a speck of a country the dot is its only mark.

A hovered or highlighted country goes to opacity 1, which confirms which country the tooltip names. The highlight (`.hl`) also switches to the lighter `--color-brand-alt` fill, because the busiest country is already near full opacity and would otherwise show no change. The caption's `data-map-tip` span, filled by the page's script on hover, is hidden below `sm`: touch has no hover, and the ranking tile carries the same figures.
