# 0212. The 404 page is prerendered and costs nothing at runtime

`src/pages/404.astro` is prerendered. Its tiles show a build-time figure where one is free (the post count, the uses count) and otherwise the page's location, which gives them content without any runtime cost. The requested path is filled in on the client from `location.pathname`.

The hero is a `data-lattice="text:404"` field and also carries a visible "Error 404" label, which covers a browser with no WebGL.
