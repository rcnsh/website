import type { APIRoute } from "astro";
import { agentInstructions } from "@/lib/agent-content";

/**
 * A dedicated instruction file for clients that look for one rather than
 * reading /llms.txt. Same guidance, minus the site map.
 */
export const GET: APIRoute = () => {
  return new Response(agentInstructions(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
