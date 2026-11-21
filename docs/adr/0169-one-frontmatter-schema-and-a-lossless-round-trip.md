# 0169. Posts are Markdown under one frontmatter schema, and round-trip losslessly through the editor

The blog collection in `src/content.config.ts` globs `**/*.md` under `src/content/blog` only. Supporting MDX would need only `@astrojs/mdx` and a wider pattern.

`postSchema` is defined once, in `src/lib/post-source.ts`, and used by both `content.config.ts` and the on-site editor. It runs at build time, so a post missing its date fails the build and names the file. The editor must refuse exactly what the build would, since a saved commit that fails the schema fails the deploy it triggers. `src/lib/post-slug.ts` has no imports because the editor page bundles it into client JavaScript.

The editor rewrites post files on save, so a post whose source does not round-trip would be silently changed by an edit. Frontmatter strings are written with `JSON.stringify` plus escaping of U+2028 and U+2029: a JSON string is a valid YAML double-quoted scalar except that YAML reads those two line separators as line breaks, which JSON leaves raw, so a title containing one would not round-trip. `src/lib/post-source.test.ts` parses and re-serialises every real post in `src/content/blog` and asserts the round trip is lossless.
