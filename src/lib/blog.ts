import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;

export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    ({ data }) => import.meta.env.DEV || !data.draft,
  );

  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

export const postHref = (post: Post) => `/blog/${post.id}`;

export const postOgHref = (post: Post) => `/og/blog/${post.id}.png`;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const formatDate = (date: Date) => DATE_FORMAT.format(date);

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export { readingTime } from "./utils";
