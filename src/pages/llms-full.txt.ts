import type { APIRoute } from "astro";
import { llmsFullTxt } from "@/lib/agent-content";

/**
 * /llms-full.txt — every page and post inlined, so an agent can take the whole
 * site in one fetch instead of crawling it. Same sources the HTML renders from.
 *
 * Served by the Worker for the same reason as /llms.txt: a prerendered `.txt`
 * is typed text/plain by the asset store regardless of what the route sets.
 */
export const prerender = false;
export const GET: APIRoute = async () => {
  return new Response(await llmsFullTxt(), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
