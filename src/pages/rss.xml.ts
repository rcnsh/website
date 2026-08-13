import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPosts, postHref } from "@/lib/blog";
import { pages, site } from "@/lib/site";

/**
 * Summaries only, not full post bodies — rendering Markdown to a string outside
 * a component needs the container API, and a feed that links back is enough.
 */
export async function GET(context: APIContext) {
  const posts = await getPosts();

  return rss({
    title: `${site.name} — ${pages.blog.title}`,
    description: pages.blog.feedDescription,
    site: context.site ?? site.url,
    trailingSlash: false,
    customData: "<language>en-gb</language>",
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postHref(post),
    })),
  });
}
