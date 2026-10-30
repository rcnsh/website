import { waitUntil } from "cloudflare:workers";
import { createEdgeCache } from "./edge-cache";

/** The colo cache, bound to the Worker. The logic and its tests live in lib/edge-cache. */
export const { edgeCached, invalidateEdge } = createEdgeCache({
  open: (name) => caches.open(name),
  waitUntil,
});
