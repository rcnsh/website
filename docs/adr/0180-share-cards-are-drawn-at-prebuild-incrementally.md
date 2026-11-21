# 0180. Share cards are drawn at prebuild, incrementally by mtime

OG share cards cannot be rendered in the Worker: workerd has neither sharp's native binding nor a font file to read off disk. `scripts/generate-og.ts` therefore draws a card for every post and nav page into `public/og/` as a prebuild step, rather than serving them from an endpoint. The home page has no generated card; it uses the static, hand-made `public/og.png` as the site's card.

Generation is incremental by mtime. A post's card is redrawn when the post is newer than its card. The mtimes of `src/lib/og.ts`, `src/lib/palette.ts`, `src/styles/global.css` and the generator script itself (`LAYOUT_SOURCES`) invalidate every card, because each changes the look of every card, so a card newer than its post can still be stale. Page cards are also redrawn when `site.json` changes, and cards with no source left are pruned.

The script runs under plain Node, which cannot load `src/lib/blog.ts` because it imports `astro:content`. `readingTime` therefore lives in `src/lib/utils.ts` and `blog.ts` re-exports it, so the card and the post page show the same count. The yaml parser returns a `Date` for a bare `2026-08-29` but a string for a quoted one, so `pubDate` is accepted as either and coerced.

satori cannot resolve CSS custom properties, so the card and the badge (`src/lib/badge.ts`) take their colours from `loadPalette` (`src/lib/palette.ts`), which reads the `--color-*` tokens out of `src/styles/global.css` when they are drawn and throws if one is missing. A palette change in `global.css` therefore reaches both images, and no hex value is copied into TypeScript.
