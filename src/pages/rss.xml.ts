import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPosts, postHref } from "@/lib/blog";
import { pages, site } from "@/lib/site";

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
