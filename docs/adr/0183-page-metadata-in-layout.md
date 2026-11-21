# 0183. Page metadata is normalised in Layout

`src/layouts/Layout.astro` writes every page's canonical URL, description and share-card tags.

The canonical URL is the pathname with a trailing `/index.html` or `.html` removed. `build.format: "file"` prerenders each page under its file name (`/index.html`, `/blog.html`), but the site serves the clean path and redirects the `.html` one; a canonical naming the file points Google at a redirect, and it drops the page as a duplicate. The meta description strips `[label](url)` to `label`, because `site.description` may carry Markdown links, which must not appear raw in meta tags.

`og:image` is always resolved to an absolute URL against `site.url`, since every scraper that reads it ignores a relative URL. `og:image:width` and `og:image:height` are emitted, defaulting to the card size (1200x630, the size `lib/og.ts` draws at, `OG_IMAGE`), and omitted when `imageSize` is `null`: scrapers read the dimensions before fetching the image, and a non-card image must not claim the card's size. The `twitter:*` tags name the image too, even though X falls back to `og:*`, because card validators and some other scrapers read only `twitter:*`.
