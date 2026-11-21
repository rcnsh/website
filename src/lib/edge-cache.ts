import { uncachedError, type CachePolicy } from "../../shared/cache-policy.ts";

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
  policy: CachePolicy;
  headers?: Record<string, string>;
  fromHit?: (hit: Response) => Promise<Response>;
};

export function createEdgeCache({ open, waitUntil }: EdgeCacheDeps) {
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
