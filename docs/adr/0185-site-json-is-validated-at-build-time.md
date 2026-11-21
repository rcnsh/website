# 0185. site.json is validated with zod at build time

`src/content/site.json` is validated with zod at module load in `src/lib/site.ts`. Vite inlines the JSON at build time, so a typo fails the build with the exact path rather than rendering a broken page. `clock.timeZone` is the owner's timezone, not the visitor's, and is validated against the runtime's timezone database (`Intl.DateTimeFormat`), so an unknown zone fails the build instead of throwing at render.

Some fields are deliberately separate. `metaDescription` feeds `<meta name="description">` only and is never rendered: it is written for search, apart from the visible tagline. `pages.blog` carries a `feedDescription` beside its `description`, because the page description is written for search and a feed subscriber needs its own line.

A link's `icon` names an entry in `src/components/icons.ts`. The schema accepts any string, so the tie to the icon set is by name only.

Every key of `pages` gets a share card at `/og/pages/<key>.png`. The home page is not a key of `config.pages`, so it keeps the static `/og.png`.
