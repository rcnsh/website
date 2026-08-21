/**
 * What the MCP server exposes: tools an agent can call, and resources it can
 * read.
 *
 * Handlers take their data through `McpProviders` rather than importing the
 * Spotify/GitHub/R2 libraries directly, because those reach for
 * `cloudflare:workers` bindings the moment they are imported. Injecting them
 * keeps this module — and the dispatcher next to it — runnable under plain
 * `node --test`.
 */

import {
  absolute,
  AGENT_RESOURCES,
  type PostSummary,
} from "../agent-docs.ts";

/** A page body already rendered to Markdown. */
export interface PageDocument {
  /** Site-relative, matching a path in the agent-docs catalogue. */
  path: string;
  title: string;
  description: string;
  markdown: string;
}

export interface McpProviders {
  /** Origin, no trailing slash — resource URIs are built from it. */
  origin: string;
  pages(): Promise<PageDocument[]>;
  posts(): Promise<PostSummary[]>;
  llmsTxt(): Promise<string>;
  llmsFullTxt(): Promise<string>;
  agentInstructions(): Promise<string>;
  nowPlaying(): Promise<unknown>;
  topMusic(type: TopType, range: TimeRange): Promise<unknown>;
  repos(): Promise<unknown>;
  searchFiles(query: string, limit: number): Promise<unknown>;
}

export type TopType = "tracks" | "artists" | "recent";
export type TimeRange = "short_term" | "medium_term" | "long_term";

const TOP_TYPES: TopType[] = ["tracks", "artists", "recent"];
const TIME_RANGES: TimeRange[] = ["short_term", "medium_term", "long_term"];

/* --- Resources ----------------------------------------------------------- */

export interface McpResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * The resource list, built from the live page set so it can't advertise a URI
 * that 404s. Every entry is a URL that resolves in a browser too, which is the
 * difference between a resource an agent can follow up and a dead identifier.
 */
export async function listResources(
  providers: McpProviders,
): Promise<McpResource[]> {
  const { origin } = providers;
  const [pages, posts] = await Promise.all([
    providers.pages(),
    providers.posts(),
  ]);

  const described = new Map(
    AGENT_RESOURCES.map((resource) => [resource.path, resource]),
  );

  const documents: McpResource[] = pages.map((page) => ({
    uri: absolute(origin, page.path),
    name: page.path === "/" ? "home" : page.path.replace(/^\//, ""),
    title: page.title,
    description: described.get(page.path)?.description ?? page.description,
    mimeType: "text/markdown",
  }));

  const generated: McpResource[] = [
    {
      uri: absolute(origin, "/llms.txt"),
      name: "llms.txt",
      title: "Site map for agents",
      description:
        "What the site is for, when to use it, and every resource on it, annotated.",
      mimeType: "text/markdown",
    },
    {
      uri: absolute(origin, "/llms-full.txt"),
      name: "llms-full.txt",
      title: "The whole site, inline",
      description:
        "Every page and post concatenated into one Markdown document.",
      mimeType: "text/markdown",
    },
    {
      uri: absolute(origin, "/.well-known/agent-instructions.md"),
      name: "agent-instructions",
      title: "Agent instructions",
      description:
        "When to reach for this site, when not to, and how to call it.",
      mimeType: "text/markdown",
    },
  ];

  const written: McpResource[] = posts.map((post) => ({
    uri: absolute(origin, post.href),
    name: post.href.replace(/^\/blog\//, "post/"),
    title: post.title,
    description: `${post.description} Published ${post.date}.`,
    mimeType: "text/markdown",
  }));

  return [...generated, ...documents, ...written];
}

/** Reads one resource, or returns null so the caller can raise the right error. */
export async function readResource(
  uri: string,
  providers: McpProviders,
): Promise<ResourceContents | null> {
  const { origin } = providers;
  const markdown = (text: string): ResourceContents => ({
    uri,
    mimeType: "text/markdown",
    text,
  });

  if (uri === absolute(origin, "/llms.txt")) {
    return markdown(await providers.llmsTxt());
  }
  if (uri === absolute(origin, "/llms-full.txt")) {
    return markdown(await providers.llmsFullTxt());
  }
  if (uri === absolute(origin, "/.well-known/agent-instructions.md")) {
    return markdown(await providers.agentInstructions());
  }

  for (const page of await providers.pages()) {
    if (uri === absolute(origin, page.path)) return markdown(page.markdown);
  }

  for (const post of await providers.posts()) {
    if (uri !== absolute(origin, post.href)) continue;
    return markdown(
      [
        `# ${post.title}`,
        "",
        `_Published ${post.date}._ ${post.description}`,
        "",
        post.body ?? "",
      ].join("\n"),
    );
  }

  return null;
}

/* --- Tools --------------------------------------------------------------- */

/** JSON Schema, hand-written — there are eight of them, not eighty. */
type JsonSchema = Record<string, unknown>;

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /** Returns the text blocks the tool result carries. */
  run(
    args: Record<string, unknown>,
    providers: McpProviders,
  ): Promise<string | object>;
}

/** Thrown for a bad argument, so the dispatcher can answer with -32602. */
export class InvalidParams extends Error {}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new InvalidParams(`\`${key}\` must be a string`);
  }
  return value;
}

function requiredString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = optionalString(args, key);
  if (!value?.trim()) throw new InvalidParams(`\`${key}\` is required`);
  return value.trim();
}

function boundedNumber(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidParams(`\`${key}\` must be a number`);
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function oneOf<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: T[],
  fallback: T,
): T {
  const value = optionalString(args, key);
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) {
    throw new InvalidParams(
      `\`${key}\` must be one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

/** Site-relative, leading slash, no trailing slash — matches the catalogue. */
function normalisePath(input: string): string {
  const trimmed = input.trim();
  const path = trimmed.startsWith("http")
    ? new URL(trimmed).pathname
    : trimmed;
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash === "/" ? "/" : withSlash.replace(/\/+$/, "");
}

export const TOOLS: McpTool[] = [
  {
    name: "get_page",
    title: "Read a page as Markdown",
    description:
      "Fetch any page of rcn.sh as clean Markdown — no navigation, scripts or layout. Use this instead of fetching the HTML. Call list_pages first if you do not know the path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Site-relative path, e.g. `/about`. A full https://rcn.sh URL is accepted too.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    async run(args, providers) {
      const path = normalisePath(requiredString(args, "path"));
      const pages = await providers.pages();
      const page = pages.find((candidate) => candidate.path === path);

      if (page) return page.markdown;

      const post = (await providers.posts()).find(
        (candidate) => candidate.href === path,
      );
      if (post) {
        return [`# ${post.title}`, "", post.body ?? post.description].join(
          "\n",
        );
      }

      throw new InvalidParams(
        `No page at \`${path}\`. Available: ${pages
          .map((candidate) => candidate.path)
          .join(", ")}`,
      );
    },
  },
  {
    name: "list_pages",
    title: "List every readable page",
    description:
      "Every page and post on rcn.sh with its path, title and description. The cheapest way to find out what is here before reading anything.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, providers) {
      const [pages, posts] = await Promise.all([
        providers.pages(),
        providers.posts(),
      ]);

      return {
        pages: pages.map(({ path, title, description }) => ({
          path,
          title,
          description,
          url: absolute(providers.origin, path),
        })),
        posts: posts.map(({ href, title, description, date }) => ({
          path: href,
          title,
          description,
          date,
          url: absolute(providers.origin, href),
        })),
      };
    },
  },
  {
    name: "search_site",
    title: "Search pages and posts",
    description:
      "Case-insensitive substring search across the titles, descriptions and bodies of every page and post. Returns matches with a surrounding snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
        limit: {
          type: "number",
          description: "Maximum matches to return. Default 10, maximum 50.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async run(args, providers) {
      const query = requiredString(args, "query").toLowerCase();
      const limit = boundedNumber(args, "limit", 10, 50);

      const [pages, posts] = await Promise.all([
        providers.pages(),
        providers.posts(),
      ]);

      const haystack = [
        ...pages.map((page) => ({
          path: page.path,
          title: page.title,
          text: `${page.title}\n${page.description}\n${page.markdown}`,
        })),
        ...posts.map((post) => ({
          path: post.href,
          title: post.title,
          text: `${post.title}\n${post.description}\n${post.body ?? ""}`,
        })),
      ];

      const matches = haystack.flatMap((entry) => {
        const index = entry.text.toLowerCase().indexOf(query);
        if (index === -1) return [];

        const start = Math.max(0, index - 80);
        const snippet = entry.text
          .slice(start, index + query.length + 120)
          .replace(/\s+/g, " ")
          .trim();

        return [
          {
            path: entry.path,
            title: entry.title,
            url: absolute(providers.origin, entry.path),
            snippet: `${start > 0 ? "…" : ""}${snippet}…`,
          },
        ];
      });

      return { query, matched: matches.length, results: matches.slice(0, limit) };
    },
  },
  {
    name: "list_posts",
    title: "List blog posts",
    description:
      "Every published post on rcn.sh, newest first, with its date and description. Use get_page with the returned path to read one.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum posts to return. Default 20, maximum 100.",
        },
      },
      additionalProperties: false,
    },
    async run(args, providers) {
      const limit = boundedNumber(args, "limit", 20, 100);
      const posts = await providers.posts();

      return {
        total: posts.length,
        posts: posts.slice(0, limit).map(({ title, description, href, date }) => ({
          title,
          description,
          date,
          path: href,
          url: absolute(providers.origin, href),
        })),
      };
    },
  },
  {
    name: "list_repos",
    title: "List public GitHub repositories",
    description:
      "The repositories highlighted on rcn.sh, with description, language and star count, straight from the GitHub API.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, providers) {
      return { repos: await providers.repos() };
    },
  },
  {
    name: "now_playing",
    title: "What is playing on Spotify",
    description:
      "The track playing right now, or the last one played if nothing is. Live data — do not cache the answer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, providers) {
      return (await providers.nowPlaying()) as object;
    },
  },
  {
    name: "top_music",
    title: "Top tracks, artists, or recent plays",
    description:
      "Spotify listening history: top tracks or artists over a window, or the most recently played tracks.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: TOP_TYPES,
          description: "Default `tracks`. `recent` ignores `range`.",
        },
        range: {
          type: "string",
          enum: TIME_RANGES,
          description:
            "Spotify's windows: roughly 4 weeks, 6 months, or all time. Default `long_term`.",
        },
      },
      additionalProperties: false,
    },
    async run(args, providers) {
      const type = oneOf(args, "type", TOP_TYPES, "tracks");
      const range = oneOf(args, "range", TIME_RANGES, "long_term");
      return (await providers.topMusic(type, range)) as object;
    },
  },
  {
    name: "search_files",
    title: "Search the public file bucket",
    description:
      "Search the public Cloudflare R2 bucket behind rcn.sh/files by filename. Returns direct download URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Filename fragment. At least two characters.",
        },
        limit: {
          type: "number",
          description: "Maximum files to return. Default 25, maximum 100.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async run(args, providers) {
      const query = requiredString(args, "query");
      if (query.length < 2) {
        throw new InvalidParams("`query` must be at least two characters");
      }
      const limit = boundedNumber(args, "limit", 25, 100);
      return { query, files: await providers.searchFiles(query, limit) };
    },
  },
];

export const toolByName = (name: string): McpTool | undefined =>
  TOOLS.find((tool) => tool.name === name);
