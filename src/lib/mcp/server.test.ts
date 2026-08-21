import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructions,
  buildManifest,
  CAPABILITIES,
  dispatch,
  isNotification,
  JSONRPC_ERRORS,
  LATEST_PROTOCOL_VERSION,
  negotiateProtocol,
  PROTOCOL_VERSIONS,
  SERVER_INFO,
  type JsonRpcResponse,
} from "./server.ts";
import { TOOLS, type McpProviders, type PageDocument } from "./catalog.ts";
import type { PostSummary } from "../agent-docs.ts";

const PAGES: PageDocument[] = [
  {
    path: "/",
    title: "Home",
    description: "The homepage.",
    markdown: "# Jacob Wiltshire\n\nA computer science student.",
  },
  {
    path: "/about",
    title: "About",
    description: "Longer biography.",
    markdown: "# About\n\nHe studies at Newcastle and writes TypeScript.",
  },
];

const POSTS: PostSummary[] = [
  {
    title: "First post",
    description: "About caching.",
    href: "/blog/first-post",
    date: "2026-02-01",
    body: "Caching is hard, and naming things.",
  },
];

const providers: McpProviders = {
  origin: "https://rcn.sh",
  pages: async () => PAGES,
  posts: async () => POSTS,
  llmsTxt: async () => "# llms.txt\n\nThe map.",
  llmsFullTxt: async () => "# everything\n\nInline.",
  agentInstructions: async () => "# Agent instructions\n\nWhen to use this.",
  nowPlaying: async () => ({ playing: true, title: "A song" }),
  topMusic: async (type, range) => ({ type, range, items: [] }),
  repos: async () => [{ name: "rcnsh-new" }],
  searchFiles: async (query, limit) => [{ name: `${query}-${limit}.txt` }],
};

const OPTIONS = { providers, instructions: "Test instructions." };

const call = async (
  method: string,
  params?: Record<string, unknown>,
  id: string | number = 1,
) => (await dispatch({ jsonrpc: "2.0", id, method, params }, OPTIONS)) as
  | JsonRpcResponse
  | null;

const result = async (method: string, params?: Record<string, unknown>) => {
  const response = await call(method, params);
  assert.ok(response, `${method} returned no response`);
  assert.equal(
    response.error,
    undefined,
    `${method} errored: ${JSON.stringify(response.error)}`,
  );
  return response.result as Record<string, unknown>;
};

/* --- Handshake ----------------------------------------------------------- */

test("initialize echoes a version the client asked for", async () => {
  for (const version of PROTOCOL_VERSIONS) {
    const initialised = await result("initialize", {
      protocolVersion: version,
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    assert.equal(initialised.protocolVersion, version);
  }
});

test("an unknown version is answered, not refused", async () => {
  const initialised = await result("initialize", {
    protocolVersion: "1999-01-01",
  });
  assert.equal(initialised.protocolVersion, LATEST_PROTOCOL_VERSION);
  assert.equal(negotiateProtocol(undefined), LATEST_PROTOCOL_VERSION);
});

test("initialize reports the capabilities and identity", async () => {
  const initialised = await result("initialize", {});

  assert.deepEqual(initialised.capabilities, CAPABILITIES);
  assert.deepEqual(initialised.serverInfo, SERVER_INFO);
  assert.equal(initialised.instructions, "Test instructions.");
});

test("server/discover answers the 2026-07-28 way", async () => {
  const discovered = await result("server/discover", {
    _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
  });

  assert.equal(discovered.resultType, "complete");
  assert.deepEqual(discovered.supportedVersions, [...PROTOCOL_VERSIONS]);
  assert.deepEqual(discovered.capabilities, CAPABILITIES);
  assert.deepEqual(
    (discovered._meta as Record<string, unknown>)[
      "io.modelcontextprotocol/serverInfo"
    ],
    SERVER_INFO,
  );
});

test("notifications get no response at all", async () => {
  assert.equal(
    await dispatch(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      OPTIONS,
    ),
    null,
  );
  assert.ok(isNotification({ id: undefined }));
  assert.ok(isNotification({ id: null }));
  assert.ok(!isNotification({ id: 0 }));
});

test("ping is answered with an empty result", async () => {
  assert.deepEqual(await result("ping"), {});
});

/* --- Resources ----------------------------------------------------------- */

test("declaring the resources capability means resources/list is non-empty", async () => {
  // The exact failure the audit flagged: capability advertised, list empty.
  assert.ok("resources" in CAPABILITIES);

  const listed = (await result("resources/list")).resources as {
    uri: string;
    mimeType: string;
    name: string;
  }[];

  assert.ok(listed.length > 0, "resources/list returned nothing");
  for (const resource of listed) {
    assert.match(resource.uri, /^https:\/\/rcn\.sh\//);
    assert.match(resource.mimeType, /^[a-z]+\/[a-z0-9.+-]+$/);
    assert.ok(resource.name.length > 0);
  }
});

test("every listed resource reads back with content", async () => {
  const listed = (await result("resources/list")).resources as {
    uri: string;
    mimeType: string;
  }[];

  for (const resource of listed) {
    const read = await result("resources/read", { uri: resource.uri });
    const contents = read.contents as {
      uri: string;
      mimeType: string;
      text: string;
    }[];

    assert.equal(contents.length, 1, `${resource.uri}: expected one body`);
    assert.equal(contents[0]?.uri, resource.uri);
    assert.equal(contents[0]?.mimeType, resource.mimeType);
    assert.ok(
      (contents[0]?.text ?? "").trim().length > 0,
      `${resource.uri}: empty body`,
    );
  }
});

test("resource uris are unique", async () => {
  const listed = (await result("resources/list")).resources as { uri: string }[];
  const uris = listed.map((resource) => resource.uri);
  assert.equal(new Set(uris).size, uris.length);
});

test("reading an unknown resource says what does exist", async () => {
  const response = await call("resources/read", {
    uri: "https://rcn.sh/nope",
  });

  assert.ok(response?.error);
  assert.equal(response.error.code, JSONRPC_ERRORS.invalidParams);
  assert.ok((response.error.data as { available: string[] }).available.length > 0);
});

test("resources/read without a uri is an invalid-params error", async () => {
  const response = await call("resources/read", {});
  assert.equal(response?.error?.code, JSONRPC_ERRORS.invalidParams);
});

/* --- Tools --------------------------------------------------------------- */

test("every tool is listed with a usable schema", async () => {
  const listed = (await result("tools/list")).tools as {
    name: string;
    description: string;
    inputSchema: { type: string; properties: object };
    annotations: { readOnlyHint: boolean };
  }[];

  assert.equal(listed.length, TOOLS.length);

  for (const tool of listed) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/);
    assert.ok(
      tool.description.length >= 40,
      `${tool.name}: description too thin for a model to choose on`,
    );
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.properties);
    assert.equal(tool.annotations.readOnlyHint, true);
  }

  const names = listed.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

test("get_page returns the markdown body", async () => {
  const called = await result("tools/call", {
    name: "get_page",
    arguments: { path: "/about" },
  });

  const [block] = called.content as { type: string; text: string }[];
  assert.equal(block?.type, "text");
  assert.ok(block?.text.includes("He studies at Newcastle"));
  assert.equal(called.isError, false);
});

test("get_page accepts a full url and a missing leading slash", async () => {
  for (const path of ["https://rcn.sh/about", "about", "/about/"]) {
    const called = await result("tools/call", {
      name: "get_page",
      arguments: { path },
    });
    const [block] = called.content as { text: string }[];
    assert.ok(block?.text.includes("# About"), `failed for ${path}`);
  }
});

test("get_page reaches posts as well as pages", async () => {
  const called = await result("tools/call", {
    name: "get_page",
    arguments: { path: "/blog/first-post" },
  });
  const [block] = called.content as { text: string }[];
  assert.ok(block?.text.includes("Caching is hard"));
});

test("a bad argument comes back as a readable tool error", async () => {
  const called = await result("tools/call", {
    name: "get_page",
    arguments: { path: "/nowhere" },
  });

  assert.equal(called.isError, true);
  const [block] = called.content as { text: string }[];
  assert.ok(block?.text.includes("/about"), "should list what does exist");
});

test("search_site finds a match in a body and snips around it", async () => {
  const called = await result("tools/call", {
    name: "search_site",
    arguments: { query: "Newcastle" },
  });

  const structured = called.structuredContent as {
    matched: number;
    results: { path: string; url: string; snippet: string }[];
  };

  assert.equal(structured.matched, 1);
  assert.equal(structured.results[0]?.path, "/about");
  assert.equal(structured.results[0]?.url, "https://rcn.sh/about");
  assert.ok(structured.results[0]?.snippet.includes("Newcastle"));
});

test("search_site respects the limit and caps it", async () => {
  const called = await result("tools/call", {
    name: "search_site",
    arguments: { query: "e", limit: 1 },
  });
  const structured = called.structuredContent as { results: unknown[] };
  assert.equal(structured.results.length, 1);
});

test("list_pages covers both pages and posts", async () => {
  const called = await result("tools/call", {
    name: "list_pages",
    arguments: {},
  });
  const structured = called.structuredContent as {
    pages: { path: string }[];
    posts: { path: string }[];
  };

  assert.deepEqual(
    structured.pages.map((page) => page.path),
    ["/", "/about"],
  );
  assert.deepEqual(
    structured.posts.map((post) => post.path),
    ["/blog/first-post"],
  );
});

test("the live-data tools pass their arguments through", async () => {
  const music = await result("tools/call", {
    name: "top_music",
    arguments: { type: "artists", range: "short_term" },
  });
  assert.deepEqual(music.structuredContent, {
    type: "artists",
    range: "short_term",
    items: [],
  });

  const files = await result("tools/call", {
    name: "search_files",
    arguments: { query: "notes", limit: 5 },
  });
  assert.deepEqual(files.structuredContent, {
    query: "notes",
    files: [{ name: "notes-5.txt" }],
  });
});

test("an out-of-range enum is rejected before it reaches the provider", async () => {
  const called = await result("tools/call", {
    name: "top_music",
    arguments: { type: "podcasts" },
  });

  assert.equal(called.isError, true);
  const [block] = called.content as { text: string }[];
  assert.ok(block?.text.includes("tracks, artists, recent"));
});

test("tool defaults apply when arguments are omitted", async () => {
  const called = await result("tools/call", { name: "top_music" });
  assert.deepEqual(called.structuredContent, {
    type: "tracks",
    range: "long_term",
    items: [],
  });
});

test("an unknown tool names the ones that exist", async () => {
  const response = await call("tools/call", { name: "drop_database" });

  assert.ok(response?.error);
  assert.equal(response.error.code, JSONRPC_ERRORS.invalidParams);
  assert.ok(
    (response.error.data as { available: string[] }).available.includes(
      "get_page",
    ),
  );
});

/* --- Protocol errors ----------------------------------------------------- */

test("an unknown method is a method-not-found error", async () => {
  const response = await call("resources/subscribe");
  assert.equal(response?.error?.code, JSONRPC_ERRORS.methodNotFound);
});

test("a non-object message is an invalid request", async () => {
  const response = await dispatch("hello", OPTIONS);
  assert.equal(response?.error?.code, JSONRPC_ERRORS.invalidRequest);
  assert.equal(response?.id, null);
});

test("a message with no method is an invalid request", async () => {
  const response = await dispatch({ jsonrpc: "2.0", id: 7 }, OPTIONS);
  assert.equal(response?.error?.code, JSONRPC_ERRORS.invalidRequest);
  assert.equal(response?.id, 7);
});

test("the id is echoed back unchanged, including a string id", async () => {
  const response = await call("ping", undefined, "abc");
  assert.equal(response?.id, "abc");
  assert.equal(response?.jsonrpc, "2.0");
});

test("a provider blowing up becomes an internal error, not a crash", async () => {
  const response = await dispatch(
    { jsonrpc: "2.0", id: 1, method: "resources/list" },
    {
      ...OPTIONS,
      providers: {
        ...providers,
        pages: async () => {
          throw new Error("R2 is having a day");
        },
      },
    },
  );

  assert.equal(response?.error?.code, JSONRPC_ERRORS.internal);
  assert.equal(response?.error?.message, "R2 is having a day");
});

/* --- Manifest ------------------------------------------------------------ */

test("the manifest advertises exactly what the server answers with", async () => {
  const manifest = await buildManifest({
    ...OPTIONS,
    url: "https://rcn.sh/mcp",
  });

  assert.deepEqual(manifest.protocolVersions, [...PROTOCOL_VERSIONS]);
  assert.deepEqual(manifest.capabilities, CAPABILITIES);
  assert.deepEqual(manifest.remotes, [
    { type: "streamable-http", url: "https://rcn.sh/mcp" },
  ]);
  assert.deepEqual(manifest.mcpServers, {
    "rcn.sh": { type: "http", url: "https://rcn.sh/mcp" },
  });

  assert.deepEqual(
    manifest.tools.map((tool) => tool.name),
    TOOLS.map((tool) => tool.name),
  );

  const listed = (await result("resources/list")).resources as { uri: string }[];
  assert.deepEqual(
    manifest.resources.map((resource) => resource.uri),
    listed.map((resource) => resource.uri),
  );
});

test("the instructions say what the server is for", () => {
  const instructions = buildInstructions("A personal site.", [
    "Answering who Jacob is.",
  ]);

  assert.ok(instructions.startsWith("A personal site."));
  assert.ok(instructions.includes("- Answering who Jacob is."));
  assert.ok(instructions.includes("read-only"));
});
