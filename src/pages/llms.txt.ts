import type { APIRoute } from "astro";
import { llmsTxt } from "@/lib/agent-content";

/**
 * /llms.txt — the llmstxt.org site map. Generated from the same catalogue that
 * builds /docs and the MCP resource list, so the three cannot drift apart.
 *
 * Served by the Worker rather than prerendered: the asset store types a file
 * by its extension, so a prerendered `.txt` would go out as text/plain
 * whatever the route says, and `_headers` cannot override Content-Type.
 */
export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(await llmsTxt(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
