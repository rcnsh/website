import type { AstroCookies } from "astro";
import type { SessionUser } from "./auth";
import { forbidden, sameOrigin } from "./csrf.ts";
import { writeOwnerHint } from "./owner-hint.ts";

export type Viewer = { session: SessionUser | null; owner: boolean };

/**
 * How a non-owner is turned away. `forbidden` is a plain 403. `not-found` and
 * `not-found-json` are 404s shaped like the route's own, where a 403 would
 * confirm the thing exists. `visitor` answers `{ owner: false }` for the GETs
 * the browser uses to ask whether it is the owner.
 */
export type Refusal = "forbidden" | "not-found" | "not-found-json" | "visitor";

export type OwnerCheck = {
  refuse: Refusal;
  /** For writes: refuse a cross-origin request before looking at the session. */
  sameOrigin?: boolean;
};

export type OwnerLocals = { owner?: boolean };

export type OwnerContext = {
  request: Request;
  url: URL;
  cookies: AstroCookies;
  locals: OwnerLocals;
};

/** For the middleware: an owner's response is nobody else's to cache. */
export function ownerCacheControl(locals: OwnerLocals): string | null {
  return locals.owner ? "private, no-store" : null;
}

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}

/** The session lookup is injected so the decisions can be tested off the Worker. */
export function ownerGuard(lookup: (cookies: AstroCookies) => Promise<Viewer>) {
  /** Who is asking, without refusing anyone. */
  async function identify(context: Pick<OwnerContext, "cookies" | "locals">): Promise<Viewer> {
    const viewer = await lookup(context.cookies);
    if (viewer.owner) context.locals.owner = true;
    return viewer;
  }

  /** A refused request also drops a hint its session no longer backs. */
  function refuse(context: Pick<OwnerContext, "cookies">, style: Refusal): Response {
    writeOwnerHint(context.cookies, null);
    switch (style) {
      case "forbidden":
        return forbidden();
      case "not-found":
        return new Response("Not found", { status: 404 });
      case "not-found-json":
        return json({ error: "Not found" }, 404, "no-store");
      case "visitor":
        return json({ owner: false }, 200, "private, no-store");
    }
  }

  /** The refusal for anyone but the owner, or null to carry on. */
  async function requireOwner(context: OwnerContext, check: OwnerCheck): Promise<Response | null> {
    if (check.sameOrigin && !sameOrigin(context.request, context.url.origin)) return forbidden();
    if ((await identify(context)).owner) return null;
    return refuse(context, check.refuse);
  }

  return { identify, refuse, requireOwner };
}
