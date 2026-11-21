# 0188. Hairlines and faint ink are set to contrasts that hold on a bright screen

Hairlines carry the whole structure of the page. The line colours are `#3f3d3a`, `#58544f` and `#2a2826`; contrasts of 1.26:1 and 1.62:1 were invisible on a bright screen. `--color-line-soft` is for tile edges and rules inside a tile and is drawn only on `--color-surface`, where the tile's own fill already separates it from the page.

`--color-ink-faint` (`#8c867e`) clears 4.5:1 on every ground: 5.39 on base, 5.16 on surface, 4.87 on raised and 4.56 on overlay. It sets the tagline, every section label and all metadata, so it is not decoration.
