# 0172. The blog editor previews with micromark, shows only sanitised output, and sits outside the form

Astro renders posts with satteri (`@astrojs/markdown-satteri`), whose browser build needs a WASI runtime. The `/blog/edit` preview therefore renders Markdown in the browser with micromark plus GFM, a second implementation of the spec the build uses, in `src/lib/markdown-preview.ts`. The module is loaded with `import()` so its packages reach no other page. It passes raw HTML through as the build does. Fenced code comes out as a bare `<pre>`, without Expressive Code's frame or highlighting.

Posts may carry raw HTML, and the preview runs in the owner's signed-in session on `/blog/edit`, where markup pasted from elsewhere could act as the owner. Because raw HTML passes through `renderPreview`, `src/components/react/PostEditor.tsx` shows only `renderSafePreview`'s output (DOMPurify over `renderPreview`), through `dangerouslySetInnerHTML`, and never `renderPreview`'s HTML directly. CSP on that page (its hashed `script-src`) already refuses inline handlers; DOMPurify is the second layer. `renderSafePreview` is browser-only, since DOMPurify needs a DOM.

The preview is rendered outside the `<form>` element, and the editor's inputs join the form by `form={FORM_ID}`: HTML parsed inside a form joins it, so a `<button>` pasted into a post would save, and commit to `main`, when clicked in the preview.

## Consequences

The preview can differ from the published post wherever micromark and satteri disagree, and code blocks never look as they will on the site.
