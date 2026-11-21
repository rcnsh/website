import type { APIRoute } from "astro";
import { json, policies } from "@/lib/http";
import { buildFs } from "@/lib/shell-fs";

export const prerender = true;

export const GET: APIRoute = async () =>
  json(await buildFs(), { policy: policies.shellFs });
