# 0209. The edge fade treats within 1px of an end as the end

`edgeFade` in `src/lib/edge-fade.ts` decides which edges of a horizontal scroller fade. It treats a position within 1px of either end as at that end, because at a device pixel ratio other than 1, fractional layout widths mean `scrollLeft` never lands exactly on the end of the travel.

`src/lib/edge-fade.test.ts` uses the contribution graph's measured widths at a 375px viewport (715px content, 335px box), so the test covers the case the graph actually hits. It pins the state scrolled fully right, left edge faded and right not: the graph scrolls itself to the newest week on mount, so that is the state a reader starts in, with hidden content on the left, and the original bug was there.

See ADR-0208.
