# 0208. The contribution graph opens on the recent end, with edge fades

On narrow screens the contribution graph scrolls horizontally with its scrollbar hidden. It starts scrolled to the most recent week, using `behavior: "instant"` because that scroll is setup, not motion the reader should watch. With the scrollbar suppressed, a fade is the only cue that more content exists, so whichever edge cuts content off fades, as decided by `edgeFade()` in `src/lib/edge-fade.ts`.

The decision sits in `edgeFade` so it can be unit-tested: the browser preview harness reports `document.hidden` and never dispatches scroll events. The island's markup arrives after the page script has run, so a `MutationObserver` initialises the scroller when the island lands.

See ADR-0209.
