# 0181. Share card fonts are vendored TTFs and text is cut to fixed lengths

`src/lib/og.ts` renders cards with satori, which cannot parse woff2. The Fontsource packages the site uses ship woff2 only, so Geist and Geist Mono are vendored as `.ttf` in `src/assets/fonts` for satori.

satori has no line clamp. Titles are cut to 90 characters and descriptions to 155, at a word boundary when one falls past 60% of the limit, followed by an ellipsis. These limits are the maxima that keep each block inside its box at the card's font sizes.
