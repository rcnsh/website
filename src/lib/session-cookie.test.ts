import { test } from "node:test";
import assert from "node:assert/strict";
import type { AstroCookies } from "astro";
import { hasOwnerHint, OWNER_HINT_COOKIE } from "./owner-hint.ts";
import { deleteSessionCookie, SESSION_COOKIE, writeSessionCookie } from "./session-cookie.ts";

type Written = { value: string; expires?: Date };

function jar(initial: Record<string, string> = {}) {
  const written = new Map<string, Written>(Object.entries(initial).map(([k, value]) => [k, { value }]));
  const cookies = {
    has: (name: string) => written.has(name),
    set: (name: string, value: string, options: { expires?: Date }) => void written.set(name, { value, expires: options.expires }),
    delete: (name: string) => void written.delete(name),
  };
  return { written, cookies: cookies as unknown as AstroCookies };
}

const DAY = 86_400_000;

test("the owner's hint expires with the session, including when it is extended", () => {
  const { written, cookies } = jar();
  const first = new Date(Date.now() + 30 * DAY);
  writeSessionCookie(cookies, "t", first, true);
  assert.equal(written.get(OWNER_HINT_COOKIE)?.expires, first);

  const extended = new Date(first.getTime() + 15 * DAY);
  writeSessionCookie(cookies, "t", extended, true);
  assert.equal(written.get(SESSION_COOKIE)?.expires, extended);
  assert.equal(written.get(OWNER_HINT_COOKIE)?.expires, extended);
});

test("anyone else's session carries no hint", () => {
  const { written, cookies } = jar({ [OWNER_HINT_COOKIE]: "1" });
  writeSessionCookie(cookies, "t", new Date(Date.now() + DAY), false);
  assert.equal(written.has(OWNER_HINT_COOKIE), false);
});

test("signing out takes the hint with the session", () => {
  const { written, cookies } = jar({ [SESSION_COOKIE]: "t", [OWNER_HINT_COOKIE]: "1" });
  deleteSessionCookie(cookies);
  assert.equal(written.size, 0);
});

test("the page reads the hint by its exact name", () => {
  assert.equal(hasOwnerHint(`a=1; ${OWNER_HINT_COOKIE}=1`), true);
  assert.equal(hasOwnerHint(`${OWNER_HINT_COOKIE}=1;b=2`), true);
  assert.equal(hasOwnerHint(`${OWNER_HINT_COOKIE}=0`), false);
  assert.equal(hasOwnerHint(`x${OWNER_HINT_COOKIE}=1`), false);
  assert.equal(hasOwnerHint(""), false);
});
