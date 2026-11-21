import {
  contentRange,
  corsHeaders,
  keyFromPath,
  PREFLIGHT_HEADERS,
  parseOrigins,
  readObject,
  type Stored,
} from "../../../shared/bucket-http.ts";
import { uncachedError } from "../../../shared/cache-policy.ts";
import { decideRead, REFUSALS, type RuleRow, rulesLoader } from "../../../shared/visibility.ts";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
}

function text(body: string, status: number, headers: Headers): Response {
  headers.set("content-type", "text/plain; charset=utf-8");
  if (status >= 400) headers.set("cache-control", uncachedError);
  return new Response(body, { status, headers });
}

function describe(object: Stored, headers: Headers): void {
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("last-modified", object.uploaded.toUTCString());
  headers.set("accept-ranges", "bytes");
}

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
      if (!key) return text(REFUSALS["bad-request"].message, REFUSALS["bad-request"].status, headers);

      rules ??= rulesLoader(async () => {
        const { results } = await env.DB.prepare("SELECT prefix, visibility FROM file_visibility").all<RuleRow>();
        return results;
      });

      const decision = await decideRead(key, rules.load, async () => false);
      if (!decision.ok) {
        if (decision.refusal === "unavailable") console.error("[upload] rules unavailable", decision.error);
        const refusal = REFUSALS[decision.refusal];
        return text(refusal.message, refusal.status, headers);
      }

      if (request.method === "HEAD") {
        const object = await env.BUCKET.head(key);
        if (!object) return text("Not found", 404, headers);
        describe(object, headers);
        headers.set("content-length", String(object.size));
        return new Response(null, { headers });
      }

      const read = await readObject(env.BUCKET, key, request.headers);
      if (read.kind === "missing") return text("Not found", 404, headers);
      if (read.kind === "unsatisfiable") {
        headers.set("content-range", read.contentRange);
        return text("Range not satisfiable", 416, headers);
      }
      if (read.kind === "not-modified" || read.kind === "precondition-failed") {
        describe(read.object, headers);
        if (read.kind === "precondition-failed") headers.set("cache-control", uncachedError);
        return new Response(null, { status: read.kind === "not-modified" ? 304 : 412, headers });
      }

      const { object } = read;
      describe(object, headers);

      if (read.kind === "partial") {
        headers.set("content-range", contentRange(read.span, object.size));
        headers.set("content-length", String(read.span.length));
        return new Response(object.body, { status: 206, headers });
      }

      headers.set("content-length", String(object.size));
      return new Response(object.body, { headers });
    },
  } satisfies ExportedHandler<Env>;
}
