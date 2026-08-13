import type { APIRoute } from "astro";
import {
  OAUTH_STATE_COOKIE,
  createSession,
  fetchGitHubUser,
  getGitHubClient,
} from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(OAUTH_STATE_COOKIE)?.value;

  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });

  // The state check is what stops a third party from replaying a login.
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/guestbook?error=state", 302);
  }

  try {
    const github = getGitHubClient(url.origin);
    const tokens = await github.validateAuthorizationCode(code);
    const user = await fetchGitHubUser(tokens.accessToken());

    await createSession(user, cookies, url.protocol === "https:");

    return redirect("/guestbook", 302);
  } catch (error) {
    console.error("[auth] GitHub callback failed", error);
    return redirect("/guestbook?error=auth", 302);
  }
};
