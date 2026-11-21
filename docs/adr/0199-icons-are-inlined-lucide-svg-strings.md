# 0199. Icons are inlined lucide SVG strings drawn on the server

Icons appear across the site, mostly in server-rendered markup. Using the React icon package would put an icon set in the browser bundle.

`src/components/icons.ts` holds raw SVG markup strings copied from lucide v1 (ISC licence), keyed by the `icon` names site.json uses. `src/components/Icon.astro` draws one on the server on lucide's 24x24 stroked grid, with lucide's default stroke attributes (`stroke="currentColor"`, width 2, round caps and joins) and no `width` or `height`: sizing belongs to the call site, which sets it with a class, and fixed attributes would fight those classes. `github` is a filled mark and sets `fill` and `stroke` on its own path. `PLAY_ICON` is a separate export, reused inside `ICONS`, so `src/components/react/PlayButton.tsx` can import it without bundling the rest of the map.

lucide v1 dropped brand icons, so React code gets `GithubIcon` and `SpotifyIcon` from `src/components/react/BrandIcons.tsx`: plain SVG path components that take `className` and draw in `currentColor`.
