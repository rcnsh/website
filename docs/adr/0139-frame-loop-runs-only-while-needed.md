# 0139. The field's frame loop runs only while needed

The field's `requestAnimationFrame` loop is the only standing one on the site, so it must not run for the whole visit. When the field is off screen and the pointer has not moved for `POINTER_LINGER_MS`, `draw()` (`src/lib/lattice/field.ts`) clears and stops the loop. Under reduced motion or with Live updates off, `draw()` renders one frame and schedules no other; scroll, resize, visibility and preference changes wake it. A still field has nothing to animate, so a loop would only burn frames.

The shader is scissored to the field's rows and widened to the whole viewport only while the pointer is uncovering the lattice. Shading the whole viewport is costly, and it is only needed while the pointer's light reaches the margins beyond the field.

`data-lattice-quiet` elements on screen are measured on every drawn frame, up to `QUIET_MAX` (4). They scroll with the page and can arrive in a server island after the page is bound, so a one-off measurement goes stale.
