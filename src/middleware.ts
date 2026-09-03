import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../shared/security.ts";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Security headers for anything the Worker renders — /guestbook, /api/*, and
 * server islands. Prerendered pages are served straight from the asset store
 * without invoking the Worker, so they are covered by public/_headers, which
 * scripts/generate-headers.ts writes from the same source this reads. The set
 * itself, and why it says what it says, lives in shared/security.ts.
 */
const SECURITY_HEADERS = securityHeaders({ dev: import.meta.env.DEV });

const CSP = "Content-Security-Policy";

/**
 * `frame-ancestors` is the one directive Astro does not emit for us, because a
 * `<meta>` CSP cannot express it and Astro writes one policy for both places.
 */
const FRAME_ANCESTORS = "frame-ancestors 'none'";

function harden(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    /*
      Never clobber a Content-Security-Policy a route already set.

      Nothing sets one today: Astro's `security.csp` would, for on-demand
      routes, but it is off because its <meta> half is incompatible with
      <ClientRouter /> — astro.config.ts explains that at length. The guard
      stays because the failure it prevents is silent and was expensive to
      find: overwriting a per-response policy that carries script hashes with
      this pre-written one, which carries 'unsafe-inline', downgrades exactly
      the routes that had the better policy, and nothing errors.
    */
    if (name === CSP) {
      const existing = response.headers.get(CSP);
      if (existing) {
        if (!existing.includes("frame-ancestors")) {
          // Astro's policy ends with a `;`. An empty directive is legal and
          // ignored, but it reads like a bug in every header inspector, so it
          // goes before the join rather than being left in.
          const policy = existing.trim().replace(/;+$/, "");
          response.headers.set(CSP, `${policy}; ${FRAME_ANCESTORS}`);
        }
        continue;
      }
    }

    response.headers.set(name, value);
  }
}

/**
 * Whether this response was rendered for someone who is signed in.
 *
 * Read off the request rather than the response: a signed-in visitor whose
 * session is not being refreshed sets no cookie on the way out, so looking for
 * `Set-Cookie` finds them only on the one request in fifteen days where the
 * session slides. The cookie they sent is the reliable signal.
 */
function personalised(cookies: { has(name: string): boolean }): boolean {
  return cookies.has(SESSION_COOKIE);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  /*
    A signed-in render is nobody else's to see.

    /guestbook is the page this is about: it renders the signer's username and
    a delete control on their own entries, and it is rendered by the Worker on
    every request. Workers Caching is off today, so nothing is storing these —
    but it is a wrangler.jsonc flag away from being on, and the failure mode of
    turning it on without this is one visitor being served another's signed-in
    page. Saying so here means the switch is safe to throw whenever it is
    wanted, rather than being a change that has to remember this one first.

    `private` keeps it out of shared caches; `no-store` keeps it out of the
    visitor's disk as well, which matters on a shared machine.
  */
  const store = personalised(context.cookies)
    ? "private, no-store"
    : null;

  try {
    harden(response);
    if (store) response.headers.set("Cache-Control", store);
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
    if (store) copy.headers.set("Cache-Control", store);
    return copy;
  }
});
