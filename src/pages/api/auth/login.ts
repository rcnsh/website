import type { APIRoute } from "astro";
import {
  COOKIE_SECURE,
  OAUTH_STATE_COOKIE,
  createAuthorizationUrl,
  generateState,
} from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const state = generateState();
  const authUrl = createAuthorizationUrl(url.origin, state);

  cookies.set(OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 60 * 10,
  });

  return redirect(authUrl, 302);
};
