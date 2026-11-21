# 0004. The page wipe is a WebGL cover over the live page, not a view transition

A view transition draws the whole document as a snapshot until it ends, so during it nothing can be hovered, every click lands on `<html>`, and the page is frozen for its length. The router's view transition has `animation: none` on every part in `src/styles/global.css`, so it ends on its first frame, and the page wipe is drawn instead by `wipePagesIn` (`src/lib/page-lifecycle.ts`) and `src/lib/lattice-wipe.ts`.

`wipePagesIn` wraps the router's loader on `astro:before-preparation`: the lattice cover from `src/lib/lattice-wipe.ts` closes over the page being left, the swap waits for both the load and `COVER_CLOSE_MS`, and the cover opens on `astro:after-swap`. The cover is `pointer-events: none` over a live page. Reduced motion gets no wipe.

Links that `needsFullLoad` (other than form posts) get no wipe, since the cover would close over a page that then sits there until the full load arrives. If no swap follows, the cover is cleared `WIPE_STUCK_MS` (4s) after it closes, so a failed load does not leave it over the page. When a preparation aborts, the cover reopens only if that preparation is still the latest: a navigation abandoned for an in-page link fires neither `before-preparation` nor `after-swap`, so the cover must reopen, while one abandoned for another page hands over to that page's close.

The cover is a second WebGL canvas appended to `<html>` beside `<body>`, so a router swap leaves it alone. One fragment shader decides each pixel's triangle on the mark's grid and whether that triangle's random turn to be covered in the page ground has come. Filling the triangles as 2D canvas paths cost tens of thousands of path segments a frame at Retina size and stalled the page on a good laptop, so it stays a shader. Its triangle side, `SIDE`, is 16 CSS px, the same as the home field's wide cell (`CELL_WIDE` in `src/lib/lattice/field.ts`), so the page breaks up into the triangles the site is drawn in. The value is restated rather than imported, so the two change together.

The canvas sits at `z-index: 40`, starting below the header (`top: var(--header-h)`). It covers the page but leaves the sticky header (TopBar, `z-50`) and the mini player (`z-index: 90`) visible and live through the transition.

Each close or open animates from the share already covered, and an open with nothing covered just clears. Restarting from 0 on a second click mid-wipe would flash the page back into view, and an open after the cover was taken away (by a clear, or after `WIPE_STUCK_MS`) would cover the page again only to uncover it. The close accelerates (`from + (1 - from) * t * t`) and the open decelerates (`from * (1 - t) ** 3`), so together they read as one continuous movement through the swap rather than two separate animations.

## Consequences

Without WebGL, `latticeCover()` returns null and navigation proceeds with no wipe and no wait. The swap waits for the cover to close, so with no cover there must be nothing to wait for, or navigation would stall.
