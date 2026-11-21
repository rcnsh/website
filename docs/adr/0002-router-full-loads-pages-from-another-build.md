# 0002. A page from another build gets a full load, never a swap

Island host ids are random per build, so the union CSP's hashes change with every build, and island props are encrypted with the build's key. A page from an earlier build has island scripts the document's policy does not allow, and the live Worker may refuse its island URLs (400), leaving Astro's fallback up for good.

The meta CSP content identifies the build: every prerendered page of a build shares it. `reloadAcrossBuilds` (`src/lib/page-lifecycle.ts`) wraps the router's loader and calls `preventDefault()` when the fetched page's meta CSP differs from the document's, forcing a full load, so the first click after a deploy is a full load. A refused form post is retried as a GET, which those routes answer by redirecting back to the form. Under `import.meta.env.DEV` it does nothing, because in dev each page keeps its own policy and every navigation would full-load.

The `_headers` default for static pages is `staticAssets` in `shared/cache-policy.ts` (`public, max-age=0, s-maxage=600`): it revalidates, from the edge, and carries no `stale-while-revalidate`. The router fetches pages with `fetch()`, which a browser answers from a stale copy under SWR, and that copy could be a page from an earlier build.
