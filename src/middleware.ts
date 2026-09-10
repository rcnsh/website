import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../shared/security.ts";
import { SESSION_COOKIE } from "@/lib/auth";
import { throttle } from "@/lib/throttle";

/** For anything the Worker renders; public/_headers covers the rest. */
const SECURITY_HEADERS = securityHeaders({ dev: import.meta.env.DEV });

const CSP = "Content-Security-Policy";

/** The one directive Astro does not emit — a `<meta>` CSP cannot express it. */
const FRAME_ANCESTORS = "frame-ancestors 'none'";

function harden(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // Never clobber a route's own CSP: overwriting a hashed policy with this
    // 'unsafe-inline' one would silently downgrade the best routes.
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
    // A Response from the Cache API or `fetch()` has immutable headers, and
    // setting one throws. Reconstructing makes them mutable.
    const copy = new Response(response.body, response);
    harden(copy);
    if (store) copy.headers.set("Cache-Control", store);
    return copy;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Before next(): every route past this point spends money, and a 429 issued
  // here costs a request and nothing else.
  const refused = await throttle(context.request, context.url.pathname);
  if (refused) return finish(refused, "private, no-store");

  const response = await next();

  // Islands are cached as a class, so every island must stay non-personalised
  // — see CLAUDE.md § Maintenance › Caching. An island that reads the session
  // must be excluded here, or the edge will serve one reader's fragment to
  // another.
  if (context.url.pathname.startsWith("/_server-islands/")) {
    return finish(
      response,
      "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
    );
  }

  // A signed-in render is nobody else's to see. The anonymous branch gets no
  // public Cache-Control either — see CLAUDE.md § Maintenance › Caching.
  const store = personalised(context.cookies)
    ? "private, no-store"
    : null;

  return finish(response, store);
});
