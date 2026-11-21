# 0194. TopBar publishes --header-h and --page-w over static fallbacks

Two layout values depend on measurements CSS cannot make. The in-page anchor offset in `global.css` needs the header's height, and below `sm` the bar wraps a second row of tabs, so a CSS fallback alone drifts. `page-band` breaks out of the page frame to the viewport width, and `100vw` includes the scrollbar gutter.

`--header-h` has static fallbacks in `src/styles/global.css`, because values must exist before TopBar's script runs. `publishHeaderHeight` in `src/components/TopBar.astro` then sets `--header-h` (the header's rounded, measured height) and `--page-w` (`documentElement.clientWidth`) on `<html>`, on every page through `onPage` and again on resize.

Heading `scroll-margin-top` is `calc(var(--header-h) + 1.5rem)`. It must be measured, not flat, because the bar wraps a second row of links below `sm`.
