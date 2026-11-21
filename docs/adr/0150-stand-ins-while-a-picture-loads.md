# 0150. Stand-ins while a picture loads

While a cover loads the field shows the mark; while an `svg:` drawing loads it shows BLANK, unless an earlier version of the same drawing is up, which stays. The mark is already what "nothing playing" looks like, so it is a natural stand-in for a cover, but for a drawing it would read as the wrong picture. A redrawn drawing (a new signature on the map) keeps the old one up to avoid a blank flash.

A failed cover or drawing load is ignored and the stand-in stays. The field is decoration: every page is complete without it, and the mark (or blank) is the correct fallback.

The BLANK picture's rect is at (-1e6, -1e6). A glyph picture scatters triangles around its rect, so placing blank far off the field guarantees nothing at all is drawn while a drawing is awaited.
