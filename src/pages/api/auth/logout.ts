import type { APIRoute } from "astro";
import { destroySession } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";

export const prerender = false;

// POST-only: a GET logout link would let any page sign the visitor out. Astro's
// `security.checkOrigin` refuses cross-site *form* posts but exempts non-form
// content types, so a cross-origin JSON POST reaches the handler — see
// lib/csrf. The explicit check closes that.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  await destroySession(cookies);
  return redirect("/guestbook", 302);
};
