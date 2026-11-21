# 0170. Only `draft: true` hides a post

A post is hidden by `draft: true` in its frontmatter and by nothing else. Astro's glob loader treats a file named `_name.md` as an ordinary entry, so it is built, and `findPosts` in `scripts/generate-og.ts` includes files starting with an underscore so they get a share card.

`getPosts` in `src/lib/blog.ts` includes drafts only when `import.meta.env.DEV` is true, so drafts can be previewed locally but never ship in the production build. Drafts get no share card, since they are not built and a card would be an orphan file in `public/`.
