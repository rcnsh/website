import DOMPurify from "dompurify";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * The editor's preview. Astro renders posts with satteri, whose browser build
 * needs a WASI runtime, so this is a second implementation of the same spec:
 * CommonMark plus GFM, raw HTML passed through as the build does. Fenced code
 * comes out as a bare <pre>, without Expressive Code's frame or highlighting.
 *
 * Loaded with `import()` by the editor so none of these packages reaches any
 * other page.
 */
export function renderPreview(markdown: string): string {
  return micromark(markdown, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

/**
 * What the editor puts on screen. Raw HTML passes through `renderPreview`
 * because the build lets it, but the preview runs it in the owner's signed-in
 * session on /blog/edit: markup pasted from elsewhere must not get to act as
 * the owner. CSP already refuses inline handlers there; this is the second
 * layer. Browser only: DOMPurify needs a DOM.
 */
export function renderSafePreview(markdown: string): string {
  return DOMPurify.sanitize(renderPreview(markdown));
}
