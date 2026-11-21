# 0196. The wordmark gradient uses registered colour properties

The `rcn` wordmark in `src/components/TopBar.astro` turns into the brand gradient on hover and focus. An unregistered custom property inside a gradient snaps rather than interpolates.

`--wm-from` and `--wm-to` are registered with `@property` as `syntax: "<color>"`, so the gradient transitions between colours. `@property` requires a literal `initial-value`, so it is `#e8e3d9`, a copy of `--color-ink`'s value; changing `--color-ink` in `global.css` means changing these two as well.

The wordmark and the nav underline gradients run at 100deg, a slight tilt that echoes the strokes in the site mark.
