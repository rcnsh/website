/**
 * An explicit same-origin check for state-changing routes.
 *
 * Astro's `security.checkOrigin` is on by default and does refuse cross-site
 * form posts, but it exempts requests whose content type is not form-like:
 *
 *   node_modules/astro/dist/core/app/origin-check.js
 *   const hasContentType = request.headers.has("content-type");
 *   if (hasContentType) {
 *     const formLikeHeader = hasFormLikeHeader(request.headers.get("content-type"));
 *     return formLikeHeader && !isSameOrigin;
 *   }
 *
 * So a cross-origin POST carrying `Content-Type: application/json` reaches the
 * handler. That is not exploitable from a browser today — JSON is not a
 * CORS-simple type, so the browser preflights, and this site answers no CORS
 * headers — but the defence is then resting on the absence of an
 * `Access-Control-Allow-Origin` somewhere else in the codebase. The day anyone
 * adds one, these routes become CSRF-able. This check does not care.
 */
export function sameOrigin(request: Request, expected: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === expected;
}

export function forbidden(): Response {
  return new Response("Forbidden", { status: 403 });
}
