# 0218. The uses inspector clones the hovered cell's drawing

`src/components/uses/UsesInspector.astro` server-renders the daily driver (the first item of the physical group), so it reads without script. On hover or focus it swaps in a clone of that cell's own svg rather than shipping each drawing a second time.

The swap animation restarts only if more than 300ms have passed since the last swap; restarting it on every cell while the pointer sweeps across the grid flickers. Leaving a cell starts a 1s timer that reverts to the daily driver, and `pointerover` on the inspector clears it, so reaching for the link in the inspector's foot does not let the tile revert under the pointer.
