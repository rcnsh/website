import {
  corsHeaders,
  isRangeError,
  keyFromPath,
  contentRange,
  PREFLIGHT_HEADERS,
  parseOrigins,
  parseRange,
  rangeOutcome,
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

function describe(object: R2Object, headers: Headers): void {
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

      let object: R2Object | R2ObjectBody | null;
      try {
        const range = parseRange(request.headers.get("range"));
        object = await env.BUCKET.get(key, { ...(range ? { range } : {}), onlyIf: request.headers });
      } catch (error) {
        if (!parseRange(request.headers.get("range")) || !isRangeError(error)) throw error;
        const head = await env.BUCKET.head(key);
        if (!head) return text("Not found", 404, headers);
        headers.set("content-range", `bytes */${head.size}`);
        return text("Range not satisfiable", 416, headers);
      }
      if (!object) return text("Not found", 404, headers);

      if (!("body" in object)) {
        describe(object, headers);
        const notModified = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
        if (!notModified) headers.set("cache-control", uncachedError);
        return new Response(null, { status: notModified ? 304 : 412, headers });
      }

      const outcome = rangeOutcome(request.headers.get("range"), object);
      if (outcome.kind === "unsatisfiable") {
        await object.body.cancel();
        headers.set("content-range", outcome.contentRange);
        return text("Range not satisfiable", 416, headers);
      }

      describe(object, headers);

      if (outcome.kind === "partial") {
        headers.set("content-range", contentRange(outcome.span, object.size));
        headers.set("content-length", String(outcome.span.length));
        return new Response(object.body, { status: 206, headers });
      }

      headers.set("content-length", String(object.size));
      return new Response(object.body, { headers });
    },
  } satisfies ExportedHandler<Env>;
}
