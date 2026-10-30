import { test } from "node:test";
import assert from "node:assert/strict";
import type { AstroCookies } from "astro";
import { ownerCacheControl, ownerGuard, type OwnerContext, type Viewer } from "./owner-guard.ts";
import { OWNER_HINT_COOKIE } from "./owner-hint.ts";

const OWNER: Viewer = { session: { githubId: 1, username: "o", displayName: null, avatarUrl: null }, owner: true };
const STRANGER: Viewer = { session: { githubId: 2, username: "s", displayName: null, avatarUrl: null }, owner: false };

function jar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    has: (name: string) => values.has(name),
    get: (name: string) => (values.has(name) ? { value: values.get(name) } : undefined),
    set: (name: string, value: string) => void values.set(name, value),
    delete: (name: string) => void values.delete(name),
  };
}

function context(origin: string | null = "https://rcn.sh", cookies = jar()): OwnerContext {
  const headers: Record<string, string> = origin ? { origin } : {};
  return {
    request: new Request("https://rcn.sh/api/x", { method: "POST", headers }),
    url: new URL("https://rcn.sh/api/x"),
    cookies: cookies as unknown as AstroCookies,
    locals: {},
  };
}

function guard(viewer: Viewer) {
  let lookups = 0;
  const g = ownerGuard(async () => {
    lookups++;
    return viewer;
  });
  return { ...g, lookups: () => lookups };
}

test("the owner passes, and their response is marked private", async () => {
  const ctx = context();
  assert.equal(await guard(OWNER).requireOwner(ctx, { refuse: "forbidden", sameOrigin: true }), null);
  assert.equal(ownerCacheControl(ctx.locals), "private, no-store");
});

test("a visitor's response is left to the route", async () => {
  const ctx = context();
  await guard(STRANGER).requireOwner(ctx, { refuse: "forbidden" });
  assert.equal(ownerCacheControl(ctx.locals), null);
});

test("each refusal style answers a non-owner as the route always has", async () => {
  const cases = [
    { refuse: "forbidden", status: 403, body: "Forbidden", cache: null },
    { refuse: "not-found", status: 404, body: "Not found", cache: null },
    { refuse: "not-found-json", status: 404, body: '{"error":"Not found"}', cache: "no-store" },
    { refuse: "visitor", status: 200, body: '{"owner":false}', cache: "private, no-store" },
  ] as const;
  for (const viewer of [STRANGER, { session: null, owner: false }]) {
    for (const { refuse, status, body, cache } of cases) {
      const response = await guard(viewer).requireOwner(context(), { refuse });
      assert.ok(response, refuse);
      assert.equal(response.status, status, refuse);
      assert.equal(await response.text(), body, refuse);
      assert.equal(response.headers.get("cache-control"), cache, refuse);
    }
  }
});

test("a cross-origin write is refused before the session is read", async () => {
  for (const origin of ["https://evil.example", null]) {
    const g = guard(OWNER);
    const ctx = context(origin);
    const response = await g.requireOwner(ctx, { refuse: "not-found", sameOrigin: true });
    assert.equal(response?.status, 403);
    assert.equal(g.lookups(), 0);
    assert.equal(ownerCacheControl(ctx.locals), null);
  }
});

test("reads don't check the origin", async () => {
  assert.equal(await guard(OWNER).requireOwner(context(null), { refuse: "visitor" }), null);
});

test("a refusal drops a stale owner hint", async () => {
  const cookies = jar({ [OWNER_HINT_COOKIE]: "1" });
  await guard(STRANGER).requireOwner(context("https://rcn.sh", cookies), { refuse: "visitor" });
  assert.equal(cookies.has(OWNER_HINT_COOKIE), false);
});

test("identify never refuses, and marks only the owner", async () => {
  const ctx = context();
  assert.deepEqual(await guard(STRANGER).identify(ctx), STRANGER);
  assert.equal(ctx.locals.owner, undefined);
  assert.deepEqual(await guard(OWNER).identify(ctx), OWNER);
  assert.equal(ctx.locals.owner, true);
});
