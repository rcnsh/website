# 0148. A title band's cover is a cropped strip

A title band is short and wide, so a whole square cover in it reads as a thumbnail pushed into the corner. From 768px up, a band's cover (`placeCover`'s `band` layout in `src/lib/lattice/geometry.ts`) is a square grown to `1 / BAND_COVER_SHOWN` (1/0.65) of the band's height and centred, so the band's own top and bottom crop it to the middle 65%; the texture stays square. At less than 0.65 a subject off the middle is lost (Late Registration's bear already is); at more, the picture narrows to a tile. The square is at most 0.7 of the frame's width (`BAND_COVER_ROOM`), because on a narrower band the cropped square would otherwise run under the title.

On a phone band the whole square is shown instead (`square` layout), at most 0.52 of the frame's width (`SQUARE_COVER_ROOM`), in the top corner above the foot row. That share clears the title and stops short of the frame's far edge.
