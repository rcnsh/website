import {
  corsHeaders,
  keyFromPath,
  PREFLIGHT_HEADERS,
  parseOrigins,
  unsatisfiable,
} from "../../../shared/bucket-http.ts";
import { parseRules, servesPublicly, type VisibilityRules } from "../../../shared/visibility.ts";

/**
 * upload.rcn.sh: the file bucket on its own domain, in place of R2's public
 * access, so a private folder can be refused. Same answers R2 gave otherwise:
 * stored metadata, ranges, conditionals, and CORS for the site.
 */

interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  /** Comma-separated origins that may read the bucket cross-origin. */
  ALLOWED_ORIGINS?: string;
}

/** How long an isolate trusts its copy of the rules; a change lands within this. */
const RULES_FRESH_MS = 10_000;

let memo: { rules: VisibilityRules; at: number } | null = null;

/** Throws when D1 is unreachable: a request must not be served on a guess. */
async function loadRules(db: D1Database): Promise<VisibilityRules> {
  if (memo && Date.now() - memo.at < RULES_FRESH_MS) return memo.rules;
  const { results } = await db
    .prepare("SELECT prefix, visibility FROM file_visibility")
    .all<{ prefix: string; visibility: string }>();
  const rules = parseRules(results);
  memo = { rules, at: Date.now() };
  return rules;
}

function text(body: string, status: number, headers: Headers): Response {
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(body, { status, headers });
}

function describe(object: R2Object, headers: Headers): void {
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("last-modified", object.uploaded.toUTCString());
  headers.set("accept-ranges", "bytes");
}

/** Offset and length actually served, from whichever form of range R2 echoes. */
function span(object: R2ObjectBody): { offset: number; length: number } | null {
  if (!object.range) return null;
  // Read by value, not by `in`: R2 hands back every field, unset ones undefined.
  const range = object.range as { offset?: number; length?: number; suffix?: number };
  if (typeof range.suffix === "number") {
    const length = Math.min(range.suffix, object.size);
    return { offset: object.size - length, length };
  }
  const offset = range.offset ?? 0;
  return { offset, length: Math.min(range.length ?? object.size - offset, object.size - offset) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = new Headers({ vary: "Origin", "x-content-type-options": "nosniff" });
    const cors = corsHeaders(request.headers.get("origin"), parseOrigins(env.ALLOWED_ORIGINS));
    for (const [name, value] of Object.entries(cors ?? {})) headers.set(name, value);

    if (request.method === "OPTIONS") {
      if (cors) for (const [name, value] of Object.entries(PREFLIGHT_HEADERS)) headers.set(name, value);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("allow", "GET, HEAD");
      return text("Method not allowed", 405, headers);
    }

    const key = keyFromPath(new URL(request.url).pathname);
    if (!key) return text("Not found", 404, headers);

    let rules: VisibilityRules;
    try {
      rules = await loadRules(env.DB);
    } catch (error) {
      console.error("[upload] rules unavailable", error);
      headers.set("cache-control", "no-store");
      return text("Unavailable", 503, headers);
    }

    // 404, not 403, so a private key's existence is not confirmed.
    if (!servesPublicly(rules, key)) {
      headers.set("cache-control", "no-store");
      return text("Not found", 404, headers);
    }

    if (request.method === "HEAD") {
      const object = await env.BUCKET.head(key);
      if (!object) return text("Not found", 404, headers);
      describe(object, headers);
      headers.set("content-length", String(object.size));
      return new Response(null, { headers });
    }

    let object: R2Object | R2ObjectBody | null;
    try {
      object = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
    } catch (error) {
      // R2 throws on a range it cannot satisfy; anything else is ours to surface.
      if (!request.headers.has("range")) throw error;
      return text("Range not satisfiable", 416, headers);
    }
    if (!object) return text("Not found", 404, headers);

    if (unsatisfiable(request.headers.get("range"), object.size)) {
      headers.set("content-range", `bytes */${object.size}`);
      return text("Range not satisfiable", 416, headers);
    }

    describe(object, headers);

    // No body means a condition in the request failed.
    if (!("body" in object)) {
      const notModified = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
      return new Response(null, { status: notModified ? 304 : 412, headers });
    }

    // Keyed on the request, as Cloudflare's own example is: `range` on the
    // object is not a promise that only part of it was asked for.
    const served = request.headers.has("range") ? span(object) : null;
    if (served) {
      headers.set("content-range", `bytes ${served.offset}-${served.offset + served.length - 1}/${object.size}`);
      headers.set("content-length", String(served.length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  },
} satisfies ExportedHandler<Env>;
