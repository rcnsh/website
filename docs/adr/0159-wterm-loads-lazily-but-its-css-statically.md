# 0159. wterm loads lazily, but its CSS is imported statically

`src/lib/palette-terminal.ts`, with wterm and its WASM core, is loaded with `import()` on the first `$` in the palette, which keeps wterm out of the page bundle. Its stylesheet, `@wterm/dom/css`, is imported statically by `src/components/CommandPalette.astro` instead. CSS that arrives with an `import()` chunk is injected into `<head>` once; the router's head swap drops it on the next soft navigation, and the cached module never injects it again.
