# 0187. The palette is warm grey with one accent that marks interaction

The palette in `src/styles/global.css` is warm grey on near-black with one accent, the logo's blue, used only to mark something interactive, so the accent stays meaningful as an affordance. `--color-ok`, `--color-warn` and `--color-bad` mark state only and are never decoration, so they keep their meaning.

The brand colours are the logo's `#305b99` to `#5b66af`, lifted for contrast on dark, so they stay faithful to the logo while legible on near-black. `--color-brand-blue` is the mark's blue half, lifted like the rest, so a gradient can run blue to indigo in the order the logo itself does. That gradient is used for fills or 1–2px rules only, never for text at reading size, where it fails contrast.
