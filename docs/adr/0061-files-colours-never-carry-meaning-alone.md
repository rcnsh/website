# 0061. File kind colours never carry meaning alone

`KIND_COLOUR` (`src/components/files/kinds.ts`) is shared by the usage bar and the browser's icons, so the two read as one key, and a colour always accompanies a text label, since colour must never be the only signal. The visitors' private share in the usage bar is a grey striped gradient (`PRIVATE_COLOUR`), because a plain colour could be mistaken for a file kind.

Text on the selected row does not use `ink-faint`: the row's fill is lighter than a tile, and `ink-faint` on it falls under the 4.5:1 WCAG contrast ratio.
