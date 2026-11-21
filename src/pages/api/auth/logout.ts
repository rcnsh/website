import type { APIRoute } from "astro";
import { destroySession } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  await destroySession(cookies);
  return redirect("/guestbook", 302);
};
