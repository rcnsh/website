# 0182. Layout places the lattice, hero and palette outside the page frame

`src/layouts/Layout.astro` renders `<Lattice />` as a direct child of `<body>`, before the page shell (only the skip link precedes it), so the canvas sits beneath every page. It shows only through elements marked `data-lattice`, which carry no background, because the canvas is under the page and a fill hides it.

The `hero` slot renders outside the max-width page frame, because the home page's lattice field runs full-bleed. `CommandPalette` is rendered in `<body>`, outside `TopBar`: the header's `backdrop-filter` creates a containing block, which would trap a `position: fixed` overlay inside the header.
