# 0005. A hash-locked meta CSP over a permissive header

Prerendered pages carry two policies, the `public/_headers` one and Astro's `<meta>`, and a browser enforces both: what runs is their intersection. A permission present in only one of them is not a permission.

The header's `script-src` keeps `'unsafe-inline'` (`contentSecurityPolicy` in `shared/security.ts`). It is the permissive floor; the meta, which hashes every inline script, is what binds. Without `'unsafe-inline'` a prerendered page would get no-inline intersected with hashes, so no inline script would run at all.

Astro's `styleDirective.resources` in `astro.config.ts` holds `'unsafe-inline'` with `kind: "attribute"`, which places it in `style-src-attr` only. CSP hashes do not apply to style attributes, so without it every runtime `element.style.setProperty` is refused, including the nav underline placing itself. Confining it to `style-src-attr` leaves `script-src` hash-locked.
