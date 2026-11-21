# 0117. /now.svg is a pure, GitHub-styled one-line SVG

`/now.svg` is a one-line listening card embedded by the GitHub profile README. It is rendered by `src/lib/now-card.ts` (`renderNowCard`, `pickLine`), a pure module with no Workers runtime dependency, so it is tested under `node --test`.

The card uses GitHub's own text colours (`COLOURS`: light `#1f2328` / `#59636e`, dark `#f0f6fc` / `#9198a1`) so the line reads as part of the README it sits in.

An SVG cannot measure its own text, so the width is estimated at `CHAR_WIDTH` = 8px per character at a 14px font (`FONT_SIZE`). 8px is wider than the average glyph at that size, so the box over-fits rather than clipping the text. Titles and artists are clipped to `MAX_FIELD` (48) characters.
