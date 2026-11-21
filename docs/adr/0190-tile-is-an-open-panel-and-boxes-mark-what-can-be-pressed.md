# 0190. A tile is an open panel; only pressable or contained things are boxed

`tile` in `src/styles/global.css` is the one container on a page: an open panel hung from a hairline, with the mark's slanted tab at the rule's start, no fill and no box, so the lattice field behind the page shows through when the pointer uncovers it. What is boxed is what can be pressed (`tile-link`) or sits inside a panel (`card`). `card` is used only for containment inside a tile (dialogs, covers, cells). Padding lives on the tile so one can opt out with `p-0`, as the file browser does to run edge to edge.

Card and tile radii are 5px and 7px; past about 8px a bento grid reads as a dashboard kit.

`row-mark` makes room for its marker with `padding-left` rather than a transform, because a translated child becomes the containing block for the title's stretched link, which then stops covering the row. Scrollbar thumbs use a transparent border with a `padding-box` background, because scrollers sit inside tiles and dialogs too, where a `--color-base` ring would show.
