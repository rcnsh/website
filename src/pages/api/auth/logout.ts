import type { APIRoute } from "astro";
import { destroySession } from "@/lib/auth";

export const prerender = false;

// POST-only: a GET logout link would let any page sign the visitor out.
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await destroySession(cookies);
  return redirect("/guestbook", 302);
};
