# 0214. /uses plates pair up on the twelve-column grid

Group plates on `/uses` span 12 columns (`groupSpan` in `src/lib/uses.ts`): 7 for the first group, beside the 5-column inspector; later groups pair up narrow then wide (5 then 7), except that a pair with the same number of items splits 6/6; a last unpaired group takes the full row. Equal pairs splitting evenly makes their grids match tile for tile.

A group's title is drawn on its plate's top border, cutting through it, which is worth knowing when writing titles in `site.json`. An item's name reserves two lines, so a name that wraps keeps its row's details aligned. Item hover effects apply only under `(hover: hover) and (pointer: fine)`, because a tap fires `:hover` and leaves it stuck.
