import type { APIRoute } from "astro";
import { agentGuidance, mcpProviders } from "@/lib/agent-content";
import {
  buildInstructions,
  buildManifest,
  dispatch,
  JSONRPC_ERRORS,
  LATEST_PROTOCOL_VERSION,
  type JsonRpcResponse,
} from "@/lib/mcp/server";
import { site } from "@/lib/site";

/**
 * The MCP endpoint, over Streamable HTTP.
 *
 * The transport is thin on purpose: a POST is one JSON-RPC message, and the
 * answer is one JSON object. Streaming exists in the spec for tools that
 * report progress — none of these do, they read a page or call one upstream —
 * so a plain `application/json` response is both simpler and faster, and the
 * spec allows the server to choose per request.
 *
 * All of it is public and read-only, so there is no session, no auth, and no
 * Origin allowlist: every origin is a legitimate one for data that is already
 * on the open web. The DNS-rebinding protection the spec asks for guards
 * *local* servers that can reach a private network; this one can't.
 */

export const prerender = false;

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "MCP-Protocol-Version",
  "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS } });

const options = () => ({
  providers: mcpProviders(),
  instructions: buildInstructions(
    agentGuidance.summary,
    agentGuidance.whenToUse,
  ),
});

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
      "access-control-max-age": "86400",
    },
  });

/**
 * There is no long-lived GET stream here: revision 2026-07-28 removed it, and
 * nothing this server does needs one. A client asking for the SSE stream gets
 * the 405 the older revisions specify for exactly that case; anything else
 * gets the manifest, which is a more useful answer to "what is at this URL?"
 * than an error.
 */
export const GET: APIRoute = async ({ request }) => {
  const accept = request.headers.get("accept") ?? "";

  if (accept.includes("text/event-stream")) {
    return json(
      {
        jsonrpc: "2.0",
        error: {
          code: JSONRPC_ERRORS.methodNotFound,
          message:
            "This server does not offer a GET event stream. POST JSON-RPC messages to this same URL.",
        },
      },
      405,
    );
  }

  return json(
    await buildManifest({ ...options(), url: `${site.url}/mcp` }),
  );
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: JSONRPC_ERRORS.parse, message: "Invalid JSON" },
      },
      400,
    );
  }

  const server = options();

  /*
    Batching was dropped in revision 2025-06-18, but a 2025-03-26 client may
    still send an array and there is no reason to refuse one.
  */
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: JSONRPC_ERRORS.invalidRequest,
            message: "Empty batch",
          },
        },
        400,
      );
    }

    const responses = (
      await Promise.all(body.map((message) => dispatch(message, server)))
    ).filter((response): response is JsonRpcResponse => response !== null);

    // A batch of nothing but notifications has nothing to answer with.
    return responses.length === 0
      ? new Response(null, { status: 202, headers: { ...JSON_HEADERS } })
      : json(responses);
  }

  const response = await dispatch(body, server);

  if (response === null) {
    // A notification. The spec is explicit: 202, no body.
    return new Response(null, { status: 202, headers: { ...JSON_HEADERS } });
  }

  return json(response);
};

/** Anything else is a method error, not a 404 — the endpoint does exist. */
export const ALL: APIRoute = ({ request }) =>
  json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: JSONRPC_ERRORS.invalidRequest,
        message: `${request.method} is not supported. Use POST for JSON-RPC, or GET for the manifest.`,
      },
    },
    405,
  );
