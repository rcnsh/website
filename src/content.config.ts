import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { postSchema } from "@/lib/post-source";

/**
 * Posts are plain Markdown under src/content/blog. The schema runs at build
 * time, so a missing date fails the build with the file named. `.md` only —
 * `@astrojs/mdx` and a wider pattern is all MDX would take. The schema is
 * shared with the on-site editor, which refuses what this would.
 */
const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.md" }),
  schema: postSchema,
});

export const collections = { blog };
