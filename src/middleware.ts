import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../shared/security.ts";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Security headers for anything the Worker renders. Prerendered pages are
 * covered by public/_headers instead, from the same source. See
 * shared/security.ts for the set itself.
 */
const SECURITY_HEADERS = securityHeaders({ dev: import.meta.env.DEV });

const CSP = "Content-Security-Policy";

/** The one directive Astro does not emit — a `<meta>` CSP cannot express it. */
const FRAME_ANCESTORS = "frame-ancestors 'none'";

function harden(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    /* Never clobber a CSP a route already set. Nothing does today, but
       overwriting a hashed per-response policy with this 'unsafe-inline' one
       would downgrade exactly the best routes, silently. */
    if (name === CSP) {
      const existing = response.headers.get(CSP);
      if (existing) {
        if (!existing.includes("frame-ancestors")) {
          // Astro's policy ends with a `;`. Legal, but it reads as a bug.
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
 * Whether this response was rendered for someone signed in. Read off the
 * request: a session that is not being refreshed sets no cookie on the way out.
 */
function personalised(cookies: { has(name: string): boolean }): boolean {
  return cookies.has(SESSION_COOKIE);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  /* A signed-in render is nobody else's to see — /guestbook carries the
     signer's username and delete controls. Workers Caching is off today, but
     it is one flag away, and this makes that flag safe to throw. */
  const store = personalised(context.cookies)
    ? "private, no-store"
    : null;

  try {
    harden(response);
    if (store) response.headers.set("Cache-Control", store);
    return response;
  } catch {
    /* A Response from the Cache API or `fetch()` has immutable headers, and
       setting one throws — a 500 with an empty body from middleware that looks
       like it cannot fail. Reconstructing makes them mutable. */
    const copy = new Response(response.body, response);
    harden(copy);
    if (store) copy.headers.set("Cache-Control", store);
    return copy;
  }
});
