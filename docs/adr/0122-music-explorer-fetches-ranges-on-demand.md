# 0122. The music explorer renders one range on the server and fetches the rest on demand

`TopMusic` (`src/components/widgets/TopMusic.astro`) server-renders only the `long_term` range, which keeps its render to one warehouse read. `MusicExplorer` (`src/components/react/MusicExplorer.tsx`) fetches other ranges when chosen and keeps every fetched range in component state, so toggling back to a range already seen is instant, with no refetch.

Switching to a cached range sets `loading` to false immediately. The in-flight fetch's `finally` is guarded on `alive`, so a switch mid-flight to a cached range would otherwise skip the reset and leave the spinner over data already present. While a range loads, the last resolved range stays on screen, dimmed and with pointer events off: showing the empty state for the round trip would flash, and a click on a row about to be replaced would open the wrong item.

The island also takes an `initialFailed` flag beside the initial tracks and artists. Without it a warehouse outage arrives as two empty arrays, and the island would claim an empty listening history instead of reporting an upstream down.
