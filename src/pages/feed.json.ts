import type { APIContext } from "astro";
import { getPosts, postHref } from "@/lib/blog";
import { pages, site } from "@/lib/site";

/** https://jsonfeed.org/version/1.1 — the same summaries the RSS feed carries. */
export async function GET(context: APIContext) {
  const posts = await getPosts();
  const base = (context.site?.toString() ?? site.url).replace(/\/+$/, "");

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${site.name} — ${pages.blog.title}`,
    description: pages.blog.feedDescription,
    home_page_url: `${base}/blog`,
    feed_url: `${base}/feed.json`,
    language: "en-GB",
    authors: [{ name: site.author, url: base }],
    items: posts.map((post) => {
      const url = `${base}${postHref(post)}`;
      return {
        id: url,
        url,
        title: post.data.title,
        summary: post.data.description,
        content_text: post.data.description,
        date_published: post.data.pubDate.toISOString(),
        ...(post.data.updatedDate && {
          date_modified: post.data.updatedDate.toISOString(),
        }),
      };
    }),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "content-type": "application/feed+json; charset=utf-8" },
  });
}
