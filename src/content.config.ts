import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
// The project's own Zod, not the copy `astro:content` re-exports — that one is
// deprecated, and src/lib/site.ts already validates against this one.
import { z } from "zod";

/**
 * Posts are plain Markdown under src/content/blog. The schema runs at build
 * time, so a missing date or an empty description fails the build with the
 * offending file named — the same bargain src/lib/site.ts makes for site.json.
 *
 * Only `.md` is matched. Adding `@astrojs/mdx` and widening the pattern to
 * `**\/*.{md,mdx}` is all it takes to mix components into a post later.
 */
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string().min(1),
    /** Used on the index, in <meta name="description">, and in both feeds. */
    description: z.string().min(1),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** Visible in `astro dev`, dropped from the production build. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
