# 0007. The build fails on inline code the union policy does not hash

Inline code the meta CSP does not hash is blocked silently after a soft navigation. Two sources produce it: an `is:inline` script, which Astro never hashes, and `transition:animate`, which emits an inline `<style>` Astro does not hash.

`unifyCsp` in `scripts/csp-union.ts` takes the sha256 of every inline `<script>` and `<style>` body on every prerendered page and fails the build, listing each page and the start of the body, if the union policy lacks it. The error means an `is:inline` script was not registered in `shared/inline-scripts.ts`, or Astro emitted an unhashed style. `inlineStyles` and `inlineScripts` in `shared/csp-union.ts` extract bodies byte for byte as a browser hashes them; any normalisation would make the check disagree with the browser. `inlineScripts` skips scripts with a `src` and any `type` outside `EXECUTABLE_TYPES` (JSON data blocks among them), because browsers do not check those against `script-src` hashes and counting them would produce false failures.

Astro's script inlining is off: `vite.build.assetsInlineLimit` in `astro.config.ts` returns `false` for `.js` files, so every page script ships as a file, while other assets keep Vite's default. Astro otherwise inlines small import-free page scripts as inline modules. Under the router each would cost a hash in every page's CSP, and the router waits for an inline module by appending a `data:` script that `script-src` refuses, so the first page-load could run before the script.

See ADR-0008.
