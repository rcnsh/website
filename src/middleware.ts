import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../shared/security.ts";
import { SESSION_COOKIE } from "@/lib/auth";
import { throttle } from "@/lib/throttle";

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

/** Hardens a response, working around headers that cannot be written to. */
function finish(response: Response, store: string | null): Response {
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
}

export const onRequest = defineMiddleware(async (context, next) => {
  /* Before next(), deliberately: every route past this point spends money —
     D1 rows, a KV read of the whole bucket tree, CPU rendering a page — and a
     429 issued here costs a request and nothing else. Only routes the Worker
     renders reach this at all; static assets are served ahead of it and are
     not billed. See lib/throttle.ts for what it does and does not bound. */
  const refused = await throttle(context.request, context.url.pathname);
  if (refused) return finish(refused, "private, no-store");

  const response = await next();

  /* A signed-in render is nobody else's to see — /guestbook carries the
     signer's username and delete controls. Workers Caching is off today, but
     it is one flag away, and this makes that flag safe to throw. */
  const store = personalised(context.cookies)
    ? "private, no-store"
    : null;

  return finish(response, store);
});
