import type { AstroCookies } from "astro";
import { COOKIE_PREFIX, COOKIE_SECURE } from "./cookies.ts";

/**
 * Readable by scripts, and only a hint: prerendered pages and publicly cached
 * islands cannot ask who is reading, so they show the owner's controls from
 * this. Nothing is granted on it; every owner check reads the session. Forging
 * it only shows controls the server then refuses.
 */
export const OWNER_HINT_COOKIE = `${COOKIE_PREFIX}rcnsh_owner`;

/** Server side. Follows the session cookie: the same expiry, or gone. */
export function writeOwnerHint(cookies: AstroCookies, expiresAt: Date | null): void {
  if (expiresAt) {
    cookies.set(OWNER_HINT_COOKIE, "1", { path: "/", secure: COOKIE_SECURE, sameSite: "lax", expires: expiresAt });
  } else if (cookies.has(OWNER_HINT_COOKIE)) {
    cookies.delete(OWNER_HINT_COOKIE, { path: "/", secure: COOKIE_SECURE });
  }
}

export function hasOwnerHint(cookie: string = document.cookie): boolean {
  return cookie.split(/;\s*/).includes(`${OWNER_HINT_COOKIE}=1`);
}

export function revealOwnerLinks(): void {
  if (!hasOwnerHint()) return;
  for (const link of document.querySelectorAll<HTMLElement>("[data-owner-only]")) {
    link.hidden = false;
  }
}
