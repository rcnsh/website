---
title: "Formatting reference"
description: "Every element the prose styles handle, in one page. Draft — visible in dev, never published."
pubDate: 2026-08-14
draft: true
---

This file exists to show what the prose styles do. It is a draft, so it renders under `astro dev` and is excluded from the production build. Delete it whenever it stops being useful — nothing depends on it.

## Frontmatter

Every post needs `title`, `description`, and `pubDate`. `updatedDate` and `draft` are optional. A missing or empty required field fails the build and names the file.

```markdown
// src/content/blog/some-post.md
---
title: "Post title"
description: "One sentence. Used on the index, in meta tags, and in both feeds."
pubDate: 2026-08-14
updatedDate: 2026-08-20
draft: false
---
```

## Code

A `// path` or `# path` comment on the first line becomes the frame title and is stripped from the output. Shell languages render as a terminal frame instead of an editor frame.

```ts
// src/lib/example.ts
export function example(input: string) {
  return input.trim();
}
```

```bash
npm run deploy
```

Line ranges after the language highlight those lines. `ins` and `del` render as diff markers.

```ts {2-3}
const a = 1;
const b = 2;
const c = 3;
const d = 4;
```

```diff
- const old = "removed";
+ const next = "added";
```

Inline `code` sits in the run of text like this.

## Text

**Bold** lifts to full ink. *Italic* is available. [Links](/blog) underline in a hairline and pick up the accent on hover.

- Unordered lists
- take faint markers
  - and nest

1. Ordered lists
2. count

> Blockquotes take a left rule and stay at body colour, since the metadata tone drops below the contrast floor at reading size.

| Column | Column |
| --- | --- |
| Tables get mono | uppercase headers |
| and hairline | row rules |

---

Headings are `h2` and below — `h1` belongs to the post title, which the layout renders from frontmatter.

### Third level

Sans-serif, a step down from `h2`.

#### Fourth level

The smallest level the styles cover.
