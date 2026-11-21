import { env } from "cloudflare:workers";
import { cached } from "./cache";
import { createWarehouse } from "./warehouse-client";

export { WarehouseNotConfigured, WarehouseShapeError } from "./warehouse-client";

export const warehouse = createWarehouse({
  env,
  fetch: (url, init) => fetch(url, init),
  cache: cached,
});
