import { defineMiddleware } from "astro:middleware";
import { type CachePolicy, privateNoStore } from "../shared/cache-policy.ts";
import { completePolicy, securityHeaders } from "../shared/security.ts";
import { SESSION_COOKIE } from "@/lib/auth";
import { islandPolicy } from "@/lib/http";
import { ownerCacheControl } from "@/lib/owner-guard";
import { throttle } from "@/lib/throttle";

const SECURITY_HEADERS = securityHeaders();

const CSP = "Content-Security-Policy";

function harden(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === CSP) {
      const existing = response.headers.get(CSP);
      if (existing) {
        response.headers.set(CSP, completePolicy(existing));
        continue;
      }
    }

    response.headers.set(name, value);
  }
}

function personalised(cookies: { has(name: string): boolean }): boolean {
  return cookies.has(SESSION_COOKIE);
}

function finish(response: Response, store: CachePolicy | null): Response {
  try {
    harden(response);
    if (store) response.headers.set("Cache-Control", store);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    harden(copy);
    if (store) copy.headers.set("Cache-Control", store);
    return copy;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const refused = await throttle(context.request, context.url.pathname);
  if (refused) return finish(refused, privateNoStore);

  const response = await next();

  if (context.url.pathname.startsWith("/_server-islands/")) {
    return finish(response, islandPolicy(context.url.pathname));
  }

  const store =
    ownerCacheControl(context.locals) ??
    (personalised(context.cookies) ? privateNoStore : null);

  return finish(response, store);
});
