# 0143. The mark is placed on lattice vertices

`placeMark` (`src/lib/lattice/geometry.ts`) picks a whole number `scale` of cells per mark triangle, a column on a whole cell, and a top row whose parity equals the parity of `scale` (odd when `scale` is odd). The mark's top edge starts a side and a half in from its left and every row shifts the lattice half a side, so only then do the mark's edges land on lattice vertices and it is drawn exactly. Placed any other way, it comes out as scattered triangles.

On a phone home field (taller than 520px) the mark spans the full width at the top, because the phone home layout leaves the space above the name for the field's picture. Title blocks have the heading there, so they place the mark in the corner at a smaller share.
