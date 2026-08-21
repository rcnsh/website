import type { APIRoute } from "astro";
import { agentGuidance, mcpProviders } from "@/lib/agent-content";
import { buildInstructions, buildManifest } from "@/lib/mcp/server";
import { site } from "@/lib/site";

/**
 * The MCP server's descriptor, at the well-known path a client probes before
 * it will open a connection. Built from the server's own declarations, so it
 * cannot advertise a tool or resource that isn't there.
 */
export const GET: APIRoute = async () => {
  const manifest = await buildManifest({
    providers: mcpProviders(),
    instructions: buildInstructions(
      agentGuidance.summary,
      agentGuidance.whenToUse,
    ),
    url: `${site.url}/mcp`,
  });

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      // Discovery from a browser-based agent on another origin.
      "access-control-allow-origin": "*",
    },
  });
};
