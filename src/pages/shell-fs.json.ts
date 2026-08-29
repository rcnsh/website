import type { APIRoute } from "astro";
import { buildFs } from "@/lib/shell-fs";

/**
 * The filesystem the command palette's shell walks.
 *
 * A prerendered file rather than markup inlined into every page: the palette
 * is drawn on the server precisely so nothing is shipped for a dialog nobody
 * has opened, and inlining a few KB of JSON on every route would give that
 * back. Fetched once, the first time someone actually opens the shell.
 */
export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildFs()), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
