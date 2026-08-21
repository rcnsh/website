import type { APIRoute } from "astro";
import { buildRobotsTxt } from "@/lib/robots";
import { agentSite } from "@/lib/agent-content";

/** See src/lib/robots.ts — the policy and the reasoning both live there. */
export const GET: APIRoute = () =>
  new Response(buildRobotsTxt(agentSite), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
