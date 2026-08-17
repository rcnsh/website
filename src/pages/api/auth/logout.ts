import type { APIRoute } from "astro";
import { destroySession } from "@/lib/auth";

export const prerender = false;

// POST-only: a GET logout link would let any page sign the visitor out. A
// cross-site POST is already refused upstream by Astro's `security.checkOrigin`,
// which is on by default, so there is no origin check to repeat here.
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await destroySession(cookies);
  return redirect("/guestbook", 302);
};
