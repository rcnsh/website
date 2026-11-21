import { waitUntil } from "cloudflare:workers";
import { createEdgeCache } from "./edge-cache";

export const { edgeCached, invalidateEdge } = createEdgeCache({
  open: (name) => caches.open(name),
  waitUntil,
});
