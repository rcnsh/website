import type { AstroCookies } from "astro";
import { COOKIE_PREFIX, COOKIE_SECURE } from "./cookies.ts";
import { writeOwnerHint } from "./owner-hint.ts";

export const SESSION_COOKIE = `${COOKIE_PREFIX}rcnsh_session`;

export function writeSessionCookie(cookies: AstroCookies, token: string, expiresAt: Date, owner: boolean): void {
  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    expires: expiresAt,
  });
  writeOwnerHint(cookies, owner ? expiresAt : null);
}

export function deleteSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/", secure: COOKIE_SECURE });
  writeOwnerHint(cookies, null);
}
