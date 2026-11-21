# 0178. Feeds carry summaries only

`/rss.xml` and `/feed.json` carry post summaries (each post's `description`, with `pages.blog.feedDescription` for the feed), not full bodies. Rendering Markdown to a string outside a component needs Astro's container API, and a feed that links back is enough.

`/feed.json` is JSON Feed 1.1 (https://jsonfeed.org/version/1.1) and carries the same summaries as `/rss.xml`, so the two feeds stay consistent.
