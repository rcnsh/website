import type { z } from "zod";
import { deadline } from "./upstream.ts";

/**
 * The only transport to the music-warehouse Worker. Free of
 * `cloudflare:workers` so it runs under `node --test`; `./warehouse` wires it
 * to the Worker's env, `fetch` and KV cache.
 *
 * Two credentials, two operations: `read` carries the read token and nothing
 * else, `play` carries the control token and nothing else.
 */

export type WarehouseEnv = {
  MUSIC_WAREHOUSE_URL?: string;
  MUSIC_WAREHOUSE_TOKEN?: string;
  MUSIC_WAREHOUSE_CONTROL_TOKEN?: string;
};

/** `cached()` from `./cache`, or a stand-in. */
export type Cache = <T>(
  key: string,
  freshForSeconds: number,
  loader: () => Promise<T>,
  options?: { maxStaleSeconds?: number },
) => Promise<T>;

export type ReadCache = {
  /** Namespaced under `warehouse:` by the client. */
  key: string;
  freshForSeconds: number;
  maxStaleSeconds?: number;
};

/**
 * A typed read. The schema's output, transforms included, is what gets cached,
 * so a change to that output needs a new cache key. No `cache` means live.
 */
export type Read<T> = {
  path: string;
  schema: z.ZodType<T>;
  cache?: ReadCache;
};

export class WarehouseNotConfigured extends Error {
  constructor() {
    super("music-warehouse is not configured.");
  }
}

/** A shape change is a failure, not empty data — see CLAUDE.md § Maintenance › Data. */
export class WarehouseShapeError extends Error {
  constructor(path: string, cause: z.ZodError) {
    super(`warehouse ${path} returned an unexpected shape: ${cause.message}`);
  }
}

export function createWarehouse({
  env,
  fetch,
  cache,
}: {
  env: WarehouseEnv;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  cache: Cache;
}) {
  async function call(
    path: string,
    token: string | undefined,
    { method = "GET", body }: { method?: string; body?: unknown } = {},
  ): Promise<Response> {
    const base = env.MUSIC_WAREHOUSE_URL;
    if (!base || !token) throw new WarehouseNotConfigured();

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["content-type"] = "application/json";

    return fetch(`${base.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: deadline(),
    });
  }

  async function load<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await call(path, env.MUSIC_WAREHOUSE_TOKEN);
    if (!response.ok) {
      // 503 means the warehouse's grant needs re-authorising; retrying will not fix it.
      const detail = response.status === 503 ? " (warehouse needs re-authorisation)" : "";
      throw new Error(`music-warehouse ${path} failed: ${response.status}${detail}`);
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new WarehouseShapeError(path, parsed.error);
    return parsed.data;
  }

  return {
    /** Throws on any transport failure or shape mismatch, so `cached()` keeps what it holds. */
    read<T>({ path, schema, cache: policy }: Read<T>): Promise<T> {
      if (!policy) return load(path, schema);
      return cache(`warehouse:${policy.key}`, policy.freshForSeconds, () => load(path, schema), {
        maxStaleSeconds: policy.maxStaleSeconds,
      });
    },

    /**
     * Starts a track on the owner's active device. Resolves with the
     * warehouse's answer whatever its status, for the caller to pass on;
     * rejects only when unconfigured or unreachable.
     */
    play(trackId: string): Promise<Response> {
      return call("/control/play", env.MUSIC_WAREHOUSE_CONTROL_TOKEN, {
        method: "POST",
        body: { track_id: trackId },
      });
    },
  };
}

export type Warehouse = ReturnType<typeof createWarehouse>;
