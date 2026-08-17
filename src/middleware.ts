import { defineMiddleware } from "astro:middleware";

/**
 * Security headers for anything the Worker renders — /guestbook, /api/*, and
 * server islands. Prerendered pages are served straight from the asset store
 * without invoking the Worker, so they are covered by public/_headers instead.
 * The two lists are the same on purpose and want changing together.
 *
 * `unsafe-inline` is in script-src because Astro emits inline scripts to
 * hydrate islands and drive the view transitions. The policy still pins every
 * external origin, which is what it is here to do — nothing renders raw HTML,
 * so there is no injection point for it to backstop.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    // Spotify spreads art across several scdn.co subdomains (i, mosaic,
    // image-cdn-*), so the wildcard rather than the one host that shows up
    // most. Still scoped to Spotify.
    "img-src 'self' data: https://*.scdn.co https://*.spotifycdn.com https://avatars.githubusercontent.com https://upload.rcn.sh",
    "upgrade-insecure-requests",
  ].join("; "),
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
});
