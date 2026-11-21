# 0166. Shell output uses indexed colours, mapped to site tokens

Shell output in `src/lib/shell-session.ts` uses only indexed ANSI colours (34 blue, 31 red, 90 faint), never truecolor. wterm maps indexed colours through CSS, and `src/components/CommandPalette.astro` maps wterm's `--term-color-*` variables to site tokens, so the palette's stylesheet decides the actual colours and the terminal follows the site theme.
