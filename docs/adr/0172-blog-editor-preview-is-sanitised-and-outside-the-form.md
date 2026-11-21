# 0172. The blog editor previews with micromark, shows only sanitised output, and sits outside the form

Astro renders posts with satteri (`@astrojs/markdown-satteri`), whose browser build needs a WASI runtime. The `/blog/edit` preview therefore renders Markdown in the browser with micromark plus GFM, a second implementation of the spec the build uses, in `src/lib/markdown-preview.ts`. The module is loaded with `import()` so its packages reach no other page. It passes raw HTML through as the build does. Fenced code comes out as a bare `<pre>`, without Expressive Code's highlighting.

The preview carries `post-body`, so `src/styles/post-body.css`, which `src/pages/blog/[...slug].astro` and `src/pages/blog/edit.astro` both import, styles its footnotes and code exactly as on a post. That stylesheet gives a bare `<pre>` (one outside `.expressive-code`) Expressive Code's frame: its border, radius, background, padding, type and top gap. Expressive Code itself does not run in the browser: its highlighter would put Shiki's grammars and themes into the editor's bundle, its styles arrive as a stylesheet injected at runtime, which the page's hashed `style-src` refuses, and its markup carries inline styles and a copy-button script that DOMPurify would have to be loosened to pass.

Posts may carry raw HTML, and the preview runs in the owner's signed-in session on `/blog/edit`, where markup pasted from elsewhere could act as the owner. Because raw HTML passes through `renderPreview`, `src/components/react/PostEditor.tsx` shows only `renderSafePreview`'s output (DOMPurify over `renderPreview`), through `dangerouslySetInnerHTML`, and never `renderPreview`'s HTML directly. CSP on that page (its hashed `script-src`) already refuses inline handlers; DOMPurify is the second layer. `renderSafePreview` is browser-only, since DOMPurify needs a DOM.

The preview is rendered outside the `<form>` element, and the editor's inputs join the form by `form={FORM_ID}`: HTML parsed inside a form joins it, so a `<button>` pasted into a post would save, and commit to `main`, when clicked in the preview.

## Consequences

The preview can differ from the published post wherever micromark and satteri disagree, and code blocks are framed as on the site but never highlighted.
