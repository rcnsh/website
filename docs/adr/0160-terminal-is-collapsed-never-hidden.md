# 0160. The terminal is collapsed in search mode, never hidden

wterm sizes its grid from its element when it mounts, and a row written to a grid that later narrows is cut, not rewrapped. A hidden, zero-size terminal would refit its scrollback to nothing. So in search mode the terminal pane in `src/components/CommandPalette.astro` is collapsed to height 0 and made `inert`, never `hidden`, while the terminal host itself keeps a fixed height so wterm's `init()` measures a real size. Its contents load only on the first `$`, so the palette costs nothing extra until it is used as a shell.

The palette list (`max-h-[21.5rem]`) and the terminal host (`h-[21.5rem]`) are both 21.5rem tall. That fits the full unfiltered list without scrolling, and matching the terminal's height keeps the dialog from jumping when switching modes.
