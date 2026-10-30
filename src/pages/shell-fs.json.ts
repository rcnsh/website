import type { APIRoute } from "astro";
import { json, policies } from "@/lib/http";
import { buildFs } from "@/lib/shell-fs";

/**
 * The filesystem the command palette's shell walks. Prerendered rather than
 * inlined into every page, and fetched the first time someone opens the shell.
 */
export const prerender = true;

export const GET: APIRoute = async () =>
  json(await buildFs(), { policy: policies.shellFs });
