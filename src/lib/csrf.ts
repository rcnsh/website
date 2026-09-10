/**
 * Same-origin check for state-changing routes.
 *
 * Astro's `security.checkOrigin` exempts requests whose content type is not
 * form-like, so a cross-origin JSON POST reaches the handler. Only the absence
 * of CORS headers stops it today; this check does not depend on that.
 */
export function sameOrigin(request: Request, expected: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === expected;
}

export function forbidden(): Response {
  return new Response("Forbidden", { status: 403 });
}
