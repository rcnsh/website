import type { APIRoute } from "astro";
import {
  OAUTH_STATE_COOKIE,
  generateState,
  getGitHubClient,
} from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const state = generateState();
  const github = getGitHubClient(url.origin);
  const authUrl = github.createAuthorizationURL(state, []);

  cookies.set(OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 60 * 10,
  });

  return redirect(authUrl.toString(), 302);
};
