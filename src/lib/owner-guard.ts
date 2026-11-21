import type { AstroCookies } from "astro";
import type { SessionUser } from "./auth";
import { noStore, privateNoStore } from "../../shared/cache-policy.ts";
import { forbidden, sameOrigin } from "./csrf.ts";
import { json } from "./json.ts";
import { writeOwnerHint } from "./owner-hint.ts";

export type Viewer = { session: SessionUser | null; owner: boolean };

export type Refusal = "forbidden" | "not-found" | "not-found-json" | "visitor";

export type OwnerCheck = {
  refuse: Refusal;
  sameOrigin?: boolean;
};

export type OwnerLocals = { owner?: boolean };

export type OwnerContext = {
  request: Request;
  url: URL;
  cookies: AstroCookies;
  locals: OwnerLocals;
};

export function ownerCacheControl(locals: OwnerLocals): string | null {
  return locals.owner ? privateNoStore : null;
}

export function ownerGuard(lookup: (cookies: AstroCookies) => Promise<Viewer>) {
  async function identify(context: Pick<OwnerContext, "cookies" | "locals">): Promise<Viewer> {
    const viewer = await lookup(context.cookies);
    if (viewer.owner) context.locals.owner = true;
    return viewer;
  }

  function refuse(context: Pick<OwnerContext, "cookies">, style: Refusal): Response {
    writeOwnerHint(context.cookies, null);
    switch (style) {
      case "forbidden":
        return forbidden();
      case "not-found":
        return new Response("Not found", { status: 404 });
      case "not-found-json":
        return json({ error: "Not found" }, { status: 404, policy: noStore });
      case "visitor":
        return json({ owner: false }, { policy: privateNoStore });
    }
  }

  async function requireOwner(context: OwnerContext, check: OwnerCheck): Promise<Response | null> {
    if (check.sameOrigin && !sameOrigin(context.request, context.url.origin)) return forbidden();
    if ((await identify(context)).owner) return null;
    return refuse(context, check.refuse);
  }

  return { identify, refuse, requireOwner };
}
