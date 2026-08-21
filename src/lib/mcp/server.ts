/**
 * A Model Context Protocol server, hand-rolled.
 *
 * The official SDK assumes a Node process with a socket; this runs inside a
 * Cloudflare Worker where a request is a function call, so the whole server is
 * one pure `dispatch(message, providers)`. That also means the protocol is
 * testable without a transport — see server.test.ts.
 *
 * Four protocol revisions are accepted, because a server that only speaks the
 * newest one is unreachable to most clients in the field:
 *
 *   2026-07-28  `server/discover`, per-request `_meta`, no handshake
 *   2025-11-25  \
 *   2025-06-18   > the `initialize` handshake
 *   2025-03-26  /
 *
 * Both entry points answer, and an unrecognised version is answered with the
 * newest one we support rather than refused — a client that can't parse the
 * reply learns that from the reply, whereas an error teaches it nothing.
 */

import {
  InvalidParams,
  listResources,
  readResource,
  TOOLS,
  toolByName,
  type McpProviders,
} from "./catalog.ts";

export const PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

export const LATEST_PROTOCOL_VERSION = PROTOCOL_VERSIONS[0];

export const SERVER_INFO = {
  name: "rcn.sh",
  title: "rcn.sh — Jacob Wiltshire",
  version: "1.0.0",
} as const;

/**
 * Declared capabilities. `resources` is here because resources/list genuinely
 * returns some — advertising it while returning nothing is the failure mode the
 * spec warns about. `prompts` is absent for the same reason: there are none.
 */
export const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false, subscribe: false },
} as const;

/* --- JSON-RPC ------------------------------------------------------------ */

export const JSONRPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** A notification has no id, so there is nothing to reply to. */
export const isNotification = (message: { id?: JsonRpcId }): boolean =>
  message.id === undefined || message.id === null;

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});

const fail = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

/**
 * Picks the revision to answer in. A client that names one we know gets it
 * back; anything else gets the newest, which is what the handshake-based
 * revisions tell servers to do when they disagree.
 */
export function negotiateProtocol(requested: unknown): string {
  return PROTOCOL_VERSIONS.includes(requested as never)
    ? (requested as string)
    : LATEST_PROTOCOL_VERSION;
}

/** Guidance the host shows the model. Same text as the agent instructions. */
export function buildInstructions(summary: string, whenToUse: string[]): string {
  return [
    summary,
    "",
    "Use it for:",
    ...whenToUse.map((line) => `- ${line}`),
    "",
    "Everything is public and read-only; no authentication is needed. Prefer `get_page` over fetching HTML, and `list_pages` before guessing a path.",
  ].join("\n");
}

export interface McpServerOptions {
  providers: McpProviders;
  instructions: string;
}

/** Shape a tool's return value into MCP content blocks. */
function toolResult(value: string | object) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return {
    content: [{ type: "text", text }],
    // Mirrored as structured output so a client can skip re-parsing the text.
    ...(typeof value === "string" ? {} : { structuredContent: value }),
    isError: false,
  };
}

/**
 * Handles one JSON-RPC message. Returns null for a notification, which the
 * transport answers with `202 Accepted` and no body.
 */
export async function dispatch(
  message: unknown,
  options: McpServerOptions,
): Promise<JsonRpcResponse | null> {
  if (typeof message !== "object" || message === null) {
    return fail(null, JSONRPC_ERRORS.invalidRequest, "Expected a JSON object");
  }

  const request = message as JsonRpcRequest;
  const id = request.id ?? null;

  if (typeof request.method !== "string") {
    return fail(id, JSONRPC_ERRORS.invalidRequest, "Missing `method`");
  }

  // Notifications are acknowledged by the transport, not answered here.
  if (request.method.startsWith("notifications/")) return null;

  const params = (request.params ?? {}) as Record<string, unknown>;
  const { providers, instructions } = options;

  try {
    switch (request.method) {
      /* 2026-07-28: one call for versions, capabilities and identity. */
      case "server/discover": {
        const meta = (params._meta ?? {}) as Record<string, unknown>;
        return ok(id, {
          resultType: "complete",
          supportedVersions: [...PROTOCOL_VERSIONS],
          capabilities: CAPABILITIES,
          instructions,
          _meta: {
            "io.modelcontextprotocol/serverInfo": SERVER_INFO,
            ...(meta["io.modelcontextprotocol/protocolVersion"]
              ? {
                  "io.modelcontextprotocol/protocolVersion": negotiateProtocol(
                    meta["io.modelcontextprotocol/protocolVersion"],
                  ),
                }
              : {}),
          },
        });
      }

      /* 2025-03-26 … 2025-11-25: the handshake. */
      case "initialize": {
        return ok(id, {
          protocolVersion: negotiateProtocol(params.protocolVersion),
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
          instructions,
        });
      }

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              title: tool.title,
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
            },
          })),
        });

      case "tools/call": {
        const name = params.name;
        if (typeof name !== "string") {
          return fail(id, JSONRPC_ERRORS.invalidParams, "Missing tool `name`");
        }

        const tool = toolByName(name);
        if (!tool) {
          return fail(
            id,
            JSONRPC_ERRORS.invalidParams,
            `Unknown tool: ${name}`,
            { available: TOOLS.map((entry) => entry.name) },
          );
        }

        const args = (params.arguments ?? {}) as Record<string, unknown>;

        try {
          return ok(id, toolResult(await tool.run(args, providers)));
        } catch (error) {
          if (error instanceof InvalidParams) {
            /*
              A bad argument is the model's mistake to fix, so it comes back as
              a tool result it can read rather than a protocol error the host
              would swallow.
            */
            return ok(id, {
              content: [{ type: "text", text: error.message }],
              isError: true,
            });
          }
          throw error;
        }
      }

      case "resources/list":
        return ok(id, { resources: await listResources(providers) });

      case "resources/templates/list":
        return ok(id, { resourceTemplates: [] });

      case "resources/read": {
        const uri = params.uri;
        if (typeof uri !== "string") {
          return fail(id, JSONRPC_ERRORS.invalidParams, "Missing `uri`");
        }

        const contents = await readResource(uri, providers);
        if (!contents) {
          return fail(
            id,
            JSONRPC_ERRORS.invalidParams,
            `Unknown resource: ${uri}`,
            {
              available: (await listResources(providers)).map(
                (resource) => resource.uri,
              ),
            },
          );
        }

        return ok(id, { contents: [contents] });
      }

      default:
        return fail(
          id,
          JSONRPC_ERRORS.methodNotFound,
          `Unknown method: ${request.method}`,
        );
    }
  } catch (error) {
    console.error("[mcp] dispatch failed", request.method, error);
    return fail(
      id,
      JSONRPC_ERRORS.internal,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}

/**
 * The manifest served at /.well-known/mcp.json, and by a plain GET on the MCP
 * endpoint. Generated from the same declarations the server answers with, so
 * discovery can't advertise a tool that isn't there.
 */
export async function buildManifest(options: McpServerOptions & { url: string }) {
  const { providers, instructions, url } = options;

  return {
    $schema: "https://modelcontextprotocol.io/schema/mcp.json",
    name: SERVER_INFO.name,
    title: SERVER_INFO.title,
    version: SERVER_INFO.version,
    description: instructions.split("\n")[0],
    instructions,
    protocolVersions: [...PROTOCOL_VERSIONS],
    capabilities: CAPABILITIES,
    authentication: { type: "none" },
    remotes: [{ type: "streamable-http", url }],
    /* The `mcpServers` block is the shape a client config file wants, so it
       can be copied straight out of here. */
    mcpServers: {
      [SERVER_INFO.name]: { type: "http", url },
    },
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    resources: (await listResources(providers)).map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType,
    })),
  };
}
