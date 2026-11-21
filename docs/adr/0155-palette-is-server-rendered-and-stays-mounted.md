# 0155. The command palette is server-rendered markup that stays mounted

The palette's rows in `src/components/CommandPalette.astro` are rendered on the server and filtered by hiding and reordering the existing elements, without a hydrated component, since the list is too small to justify hydrating a component tree. `[data-palette-item][hidden] { display: none }` is declared explicitly, because the row's own `display: flex` utility outranks the user-agent rule for `[hidden]`, and hidden rows would otherwise still show.

The palette element is placed at the end of `<body>`, outside the header. Inside the header, the header's backdrop-blur would create a containing block for fixed positioning, and the full-screen overlay would size to the header bar.

It stays in the DOM, toggled by opacity and `pointer-events`, so closing can fade out, and `inert` is set whenever it is closed, because a transparent overlay is otherwise still focusable and clickable by assistive technology. `setActive` calls `scrollIntoView` only while the palette is open, since scrolling an element inside an invisible overlay scrolls the page itself.
