import {
  corsHeaders,
  keyFromPath,
  PREFLIGHT_HEADERS,
  parseOrigins,
  unsatisfiable,
} from "../../../shared/bucket-http.ts";
import { decideRead, type RuleRow, rulesLoader } from "../../../shared/visibility.ts";

/**
 * upload.rcn.sh: the file bucket on its own domain, in place of R2's public
 * access, so a private folder can be refused. Same answers R2 gave otherwise:
 * stored metadata, ranges, conditionals, and CORS for the site.
 */

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  /** Comma-separated origins that may read the bucket cross-origin. */
  ALLOWED_ORIGINS?: string;
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

/** A handler with its own rules memo, so tests do not share one. */
export function createHandler() {
  let rules: ReturnType<typeof rulesLoader> | null = null;

  return {
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

      // The binding is the same on every request an isolate serves.
      rules ??= rulesLoader(async () => {
        const { results } = await env.DB.prepare("SELECT prefix, visibility FROM file_visibility").all<RuleRow>();
        return results;
      });

      // Nobody is the owner here: a private file goes through the site's download route.
      const decision = await decideRead(key, rules.load, async () => false);
      if (!decision.ok) {
        headers.set("cache-control", "no-store");
        if (decision.refusal !== "unavailable") return text("Not found", 404, headers);
        console.error("[upload] rules unavailable", decision.error);
        return text("Unavailable", 503, headers);
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
}

export default createHandler();
