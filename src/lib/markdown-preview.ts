import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * The editor's preview. Astro renders posts with satteri, whose browser build
 * needs a WASI runtime, so this is a second implementation of the same spec:
 * CommonMark plus GFM, raw HTML passed through as the build does. Fenced code
 * comes out as a bare <pre>, without Expressive Code's frame or highlighting.
 *
 * Loaded with `import()` by the editor so neither package reaches any other page.
 */
export function renderPreview(markdown: string): string {
  return micromark(markdown, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}
