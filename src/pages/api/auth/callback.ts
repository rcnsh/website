import type { APIRoute } from "astro";
import {
  COOKIE_SECURE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  createSession,
  exchangeCodeForToken,
  fetchGitHubUser,
} from "@/lib/auth";
import { returnPath } from "@/lib/return-path";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get(OAUTH_STATE_COOKIE)?.value;

  // Validated again: the cookie came back from the browser.
  const next = returnPath(cookies.get(OAUTH_RETURN_COOKIE)?.value);

  cookies.delete(OAUTH_STATE_COOKIE, { path: "/", secure: COOKIE_SECURE });
  cookies.delete(OAUTH_RETURN_COOKIE, { path: "/", secure: COOKIE_SECURE });

  // The state check is what stops a third party from replaying a login.
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/guestbook?error=state", 302);
  }

  try {
    const accessToken = await exchangeCodeForToken(url.origin, code);
    const user = await fetchGitHubUser(accessToken);

    await createSession(user, cookies);

    return redirect(next, 302);
  } catch (error) {
    console.error("[auth] GitHub callback failed", error);
    return redirect("/guestbook?error=signin", 302);
  }
};
