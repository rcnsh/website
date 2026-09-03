import type { APIRoute } from "astro";
import { buildFs } from "@/lib/shell-fs";

/**
 * The filesystem the command palette's shell walks. Prerendered rather than
 * inlined into every page, and fetched the first time someone opens the shell.
 */
export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildFs()), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
