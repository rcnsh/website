# 0206. Contribution days are lattice triangles

Each contribution day in `src/components/widgets/Contributions.astro` is a `clip-path` triangle, alternating up and down, coloured with the same five levels as the lattice field. The graph then echoes the triangle lattice the background draws and reads as part of the same system.

`clip-path` clips any outline or border, so a hovered day changes its fill to the ink colour instead of gaining an outline. Each cell carries a `title` attribute, which already serves touch and assistive technology, so the footer tip line mirrors the hovered day on `pointerover` only.
