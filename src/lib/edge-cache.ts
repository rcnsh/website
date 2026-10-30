import { uncachedError, type CachePolicy } from "../../shared/cache-policy.ts";

/**
 * Responses kept in this colo's Cache API, which Workers need because
 * Cloudflare does not CDN-cache a Worker's responses on `cache-control` alone.
 * Free of `cloudflare:workers`; `./edge` binds it to `caches` and `waitUntil`.
 */

export type EdgeCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
  delete(key: Request): Promise<boolean>;
};

export type EdgeCacheDeps = {
  open: (name: string) => Promise<EdgeCache>;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type EdgeOptions = {
  /** Stamped on every answer, hit or miss. */
  policy: CachePolicy;
  /** Sent to the browser and never stored, e.g. a `vary` the edge has no use for. */
  headers?: Record<string, string>;
  /**
   * Turns a hit into the answer. Defaults to its body and headers as stored.
   * Either way the result is a new Response, since a cached one has immutable
   * headers and the middleware throws setting security headers on it.
   */
  fromHit?: (hit: Response) => Promise<Response>;
};

export function createEdgeCache({ open, waitUntil }: EdgeCacheDeps) {
  /**
   * The cached answer for `url` in cache `name`, or `produce()`'s, stored in
   * the background. A rejection propagates and a non-2xx answer is returned
   * with `uncachedError`; neither is stored.
   */
  async function edgeCached(
    name: string,
    url: string,
    produce: () => Promise<Response>,
    { policy, headers = {}, fromHit }: EdgeOptions,
  ): Promise<Response> {
    const cache = await open(name);
    const key = new Request(url);

    const hit = await cache.match(key);
    if (hit) {
      const response = fromHit ? await fromHit(hit) : new Response(hit.body, hit);
      response.headers.set("cache-control", policy);
      return withHeaders(response, headers);
    }

    const response = await produce();
    if (!response.ok) {
      response.headers.set("cache-control", uncachedError);
      return response;
    }

    response.headers.set("cache-control", policy);
    waitUntil(
      cache.put(key, response.clone()).catch((error) => {
        console.error(`[edge] ${name} put failed`, error);
      }),
    );
    return withHeaders(response, headers);
  }

  /** Drops one entry. Failures are swallowed: callers drop after a committed write. */
  async function invalidateEdge(name: string, url: string): Promise<boolean> {
    try {
      return await (await open(name)).delete(new Request(url));
    } catch (error) {
      console.error(`[edge] ${name} invalidation failed`, error);
      return false;
    }
  }

  return { edgeCached, invalidateEdge };
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}
