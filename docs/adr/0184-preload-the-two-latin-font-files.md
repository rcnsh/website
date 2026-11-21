# 0184. Layout preloads the two latin font files

Without a preload the first paragraph paints twice. `src/layouts/Layout.astro` imports the Geist and Geist Mono latin `wght-normal` woff2 files with `?url` and preloads them. Those are the two subsets an English page uses, and Vite rewrites the imports to the same hashed files the stylesheet requests, so the preload matches.

The preloads carry `crossorigin`. Fonts are fetched in CORS mode even from the same origin, so a preload without it does not match the stylesheet's request and causes a second download.
