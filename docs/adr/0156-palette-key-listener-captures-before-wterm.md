# 0156. The palette's key listener captures before wterm

wterm claims Ctrl+K and Escape as terminal input and stops their propagation, so a bubbling listener never sees them while the terminal has focus. The palette's ⌘K/Ctrl+K, `/` and Escape listener in `src/components/CommandPalette.astro` is therefore a capturing window listener that stops propagation. It closes the palette on Escape before wterm receives the key, so the shell session (`src/lib/shell-session.ts`) does nothing on Escape itself.
