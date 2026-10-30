import type { APIRoute } from "astro";
import { nowPlaying } from "@/lib/now-playing-server";

export const prerender = false;

export const GET: APIRoute = ({ request }) => nowPlaying.respond(new URL(request.url).origin);
