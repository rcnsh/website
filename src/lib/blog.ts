import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"blog">;

/**
 * Newest first. Drafts stay visible under `astro dev` so a work in progress can
 * be read in place, and drop out of the production build.
 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection(
    "blog",
    ({ data }) => import.meta.env.DEV || !data.draft,
  );

  return posts.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );
}

/** The collection id is the filename without its extension. */
export const postHref = (post: Post) => `/blog/${post.id}`;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const formatDate = (date: Date) => DATE_FORMAT.format(date);

/** For <time datetime> — the machine-readable half of a rendered date. */
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const WORDS_PER_MINUTE = 200;

/**
 * Deliberately rough. Fenced and inline code are dropped rather than counted at
 * prose speed, and what's left is counted as whitespace-separated tokens.
 */
export function readingTime(body = ""): number {
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
