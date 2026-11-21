import { privateNoStore, type CachePolicy } from "../../shared/cache-policy.ts";

export type JsonInit = {
  status?: number;
  policy?: CachePolicy;
  headers?: Record<string, string>;
};

export function json(body: unknown, { status = 200, policy, headers = {} }: JsonInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(policy ? { "cache-control": policy } : {}),
      ...headers,
    },
  });
}

export const privateJson = (body: unknown, status = 200): Response =>
  json(body, { status, policy: privateNoStore });
