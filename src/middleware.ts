import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../shared/security.ts";

/**
 * Security headers for anything the Worker renders — /guestbook, /api/*, and
 * server islands. Prerendered pages are served straight from the asset store
 * without invoking the Worker, so they are covered by public/_headers, which
 * scripts/generate-headers.ts writes from the same source this reads. The set
 * itself, and why it says what it says, lives in shared/security.ts.
 */
const SECURITY_HEADERS = securityHeaders({ dev: import.meta.env.DEV });

function harden(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
}

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  try {
    harden(response);
    return response;
  } catch {
    /*
      A Response that came back from the Cache API or straight from `fetch()`
      carries immutable headers, and setting one throws — which surfaces as a
      500 with an empty body, from a middleware that looks like it cannot fail.
      /api/spotify/now-playing did exactly that on every cache hit it did not
      already rewrap.
      A route handing one of those back is a mistake worth fixing at the route,
      but it should not cost the whole response: reconstructing it makes the
      headers mutable, which is Cloudflare's own advice for this.
    */
    const copy = new Response(response.body, response);
    harden(copy);
    return copy;
  }
});
