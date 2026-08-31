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

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
});
