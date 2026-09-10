import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;

/** Newest first. Drafts stay visible under `astro dev` only. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    ({ data }) => import.meta.env.DEV || !data.draft,
  );

  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

/** The collection id is the filename without its extension. */
export const postHref = (post: Post) => `/blog/${post.id}`;

/** The post's own share card, written by scripts/generate-og.ts into public/. */
export const postOgHref = (post: Post) => `/og/blog/${post.id}.png`;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const formatDate = (date: Date) => DATE_FORMAT.format(date);

/** For <time datetime> — the machine-readable half of a rendered date. */
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

// Defined in lib/utils.ts because scripts/generate-og.ts needs the same count
// and cannot load this module.

export { readingTime } from "./utils";
