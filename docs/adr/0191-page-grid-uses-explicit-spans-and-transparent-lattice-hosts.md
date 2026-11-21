# 0191. The bento grid uses explicit spans and transparent lattice hosts

The bento page grid is twelve columns on desktop, and pages restate spans per breakpoint rather than relying on auto-placement, so nothing reflows into a gap.

`page-hero` is transparent and carries `data-lattice` on the same element: the canvas is under the page, so a fill would hide the mark drawn in its top corner. `page-band` breaks out of the page frame by `--page-w`, the viewport without its scrollbar, published by TopBar; `100vw` would include the scrollbar gutter. It has no fill, which would hide the lattice drawn beside the title, and must be a direct child of the page's `bento`.
