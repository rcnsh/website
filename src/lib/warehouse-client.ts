import type { z } from "zod";
import { deadline } from "./upstream.ts";

export type WarehouseEnv = {
  MUSIC_WAREHOUSE_URL?: string;
  MUSIC_WAREHOUSE_TOKEN?: string;
  MUSIC_WAREHOUSE_CONTROL_TOKEN?: string;
};

export type Cache = <T>(
  key: string,
  freshForSeconds: number,
  loader: () => Promise<T>,
  options?: { maxStaleSeconds?: number },
) => Promise<T>;

export type ReadCache = {
  key: string;
  freshForSeconds: number;
  maxStaleSeconds?: number;
};

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
      const detail = response.status === 503 ? " (warehouse needs re-authorisation)" : "";
      throw new Error(`music-warehouse ${path} failed: ${response.status}${detail}`);
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new WarehouseShapeError(path, parsed.error);
    return parsed.data;
  }

  return {
    read<T>({ path, schema, cache: policy }: Read<T>): Promise<T> {
      if (!policy) return load(path, schema);
      return cache(`warehouse:${policy.key}`, policy.freshForSeconds, () => load(path, schema), {
        maxStaleSeconds: policy.maxStaleSeconds,
      });
    },

    play(trackId: string): Promise<Response> {
      return call("/control/play", env.MUSIC_WAREHOUSE_CONTROL_TOKEN, {
        method: "POST",
        body: { track_id: trackId },
      });
    },
  };
}

export type Warehouse = ReturnType<typeof createWarehouse>;
