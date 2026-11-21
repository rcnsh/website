import DOMPurify from "dompurify";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

export function renderPreview(markdown: string): string {
  return micromark(markdown, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

export function renderSafePreview(markdown: string): string {
  return DOMPurify.sanitize(renderPreview(markdown));
}
