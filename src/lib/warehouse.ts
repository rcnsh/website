import { env } from "cloudflare:workers";
import { cached } from "./cache";
import { createWarehouse } from "./warehouse-client";

export { WarehouseNotConfigured, WarehouseShapeError } from "./warehouse-client";

/** The music-warehouse client over this Worker's env, `fetch` and KV. */
export const warehouse = createWarehouse({
  env,
  // Wrapped: Workers' `fetch` throws "Illegal invocation" when called off another object.
  fetch: (url, init) => fetch(url, init),
  cache: cached,
});
