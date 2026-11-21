# 0149. svg: pictures are rebuilt from data-level

A page can give the field an `svg:<selector>` picture (the guestbook world map, `GuestbookMap.astro`). The field (`src/lib/lattice/field.ts`) rebuilds it from its shapes' `data-level` alone: class, style and `data-level` are stripped and each shape is filled grey `(level + 0.5) / 5`, so the page's own colours and strokes cannot leak into the levels. Shapes are drawn in level order, and levels 3 and 4 get a round-joined stroke of 2.2% of the viewBox width. Without the stroke a small bright shape (the UK on the map) falls between the triangles' sample points and never lights up; drawing bright ones last keeps them on top.

The picture's key is the selector plus the concatenated `data-level` of every shape, so the key changes whenever what the drawing shows changes (a signature from a new country, or one deleted) and the field redraws it instead of reusing a stale texture.

The map arrives in a server island after the page. When the selector does not match yet, the field shows BLANK, watches the body with a MutationObserver and resolves again when it matches; after `DRAWING_OVERDUE_MS` (4s) with nothing, it shows the mark. Showing the mark straight away would read as the wrong picture and then be swept away.

On a phone (below 768px) the picture is centred across the frame behind the title at up to 0.9 of the field's height; wider, it sits beside the title on the right half at up to 0.84 of the height. A phone's band is too narrow to put the picture beside the title at a readable size; behind it, across the frame, it is big enough to read.
