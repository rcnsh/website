import type { APIRoute } from "astro";
import {
  COOKIE_SECURE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  createAuthorizationUrl,
  generateState,
} from "@/lib/auth";
import { returnPath } from "@/lib/return-path";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const state = generateState();
  const authUrl = createAuthorizationUrl(url.origin, state);
  const options = {
    path: "/",
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 60 * 10,
  } as const;

  cookies.set(OAUTH_STATE_COOKIE, state, options);
  cookies.set(OAUTH_RETURN_COOKIE, returnPath(url.searchParams.get("next")), options);

  return redirect(authUrl, 302);
};
