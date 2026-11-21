# 0152. The home intro holds the mark before the cover

Once per document, the home cover field holds the mark for `MARK_INTRO_MS` (2.5s) from the page's arrival, then sweeps to the cover (`startIntro` in `src/lib/lattice/field.ts`). The 2.5s covers the reveal plus a moment still, so a visitor sees both the rcn mark and the cover rather than only the cover. While the hold runs, the current cover is loaded and tone-measured in the background, so the sweep starts the moment the hold ends rather than waiting on the image.

The intro plays once per document (`introPlayed`). The field lives as long as the document, so a reload replays it while returning to the home page by a soft navigation does not. Only a cover field marked `data-lattice-intro` (the home hero) plays it: /music also draws the cover, and if it could play the intro, landing there would hold its band and spend the document's one intro before the home page.

Binding to a page without the intro cancels any hold in progress. Otherwise the timer would fire on the next page, and a cover field there (/music) would stay on the mark until the old hold ran out.
