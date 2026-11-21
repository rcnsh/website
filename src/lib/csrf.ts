export function sameOrigin(request: Request, expected: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === expected;
}

export function forbidden(): Response {
  return new Response("Forbidden", { status: 403 });
}
