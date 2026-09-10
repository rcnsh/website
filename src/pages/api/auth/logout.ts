import type { APIRoute } from "astro";
import { destroySession } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";

export const prerender = false;

// POST-only: a GET logout link would let any page sign the visitor out. The
// explicit origin check covers what `security.checkOrigin` exempts — see lib/csrf.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  await destroySession(cookies);
  return redirect("/guestbook", 302);
};
