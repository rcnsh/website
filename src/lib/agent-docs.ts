/**
 * One catalogue of everything on this site that an agent can usefully fetch,
 * and the Markdown documents built from it.
 *
 * The catalogue is the single source of truth: /llms.txt, /docs, the MCP
 * resource list, the 404 recovery body and the JSON manifest are all
 * projections of it. Adding a route in one place therefore adds it everywhere,
 * and agent-docs.test.ts checks that every path in it actually resolves.
 *
 * Pure by design — no Astro imports — so all of it is testable off a Worker.
 */

export type ResourceGroup = "Pages" | "Machine-readable" | "Feeds" | "APIs";

export interface AgentResource {
  /** Site-relative, no trailing slash. */
  path: string;
  title: string;
  description: string;
  /** What a GET returns by default. */
  mimeType: string;
  group: ResourceGroup;
  /** True when the path also serves Markdown under Accept negotiation. */
  negotiatesMarkdown?: boolean;
}

/** Human-facing routes. These negotiate Markdown; the rest have one form. */
const PAGES: AgentResource[] = [
  {
    path: "/",
    title: "Home",
    description:
      "Jacob Wiltshire's homepage: bio, current listening, GitHub activity and the tools he works in.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/about",
    title: "About",
    description:
      "Longer biography: what he studies, where, what he builds, and how this site is put together.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/contact",
    title: "Contact",
    description:
      "Email address, PGP public key and fingerprint, GitHub, and what each is appropriate for.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/privacy",
    title: "Privacy",
    description:
      "What the site stores, what it doesn't, and which third parties see a request.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/docs",
    title: "Developer & agent docs",
    description:
      "Every machine-readable endpoint on rcn.sh, with the exact request to make.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/blog",
    title: "Writing",
    description: "Index of every published post, newest first.",
    mimeType: "text/html",
    group: "Pages",
    negotiatesMarkdown: true,
  },
  {
    path: "/music",
    title: "Music",
    description:
      "Now playing, top tracks and artists, and recently played, from Spotify.",
    mimeType: "text/html",
    group: "Pages",
  },
  {
    path: "/files",
    title: "Files",
    description: "Browser for the public Cloudflare R2 bucket.",
    mimeType: "text/html",
    group: "Pages",
  },
  {
    path: "/guestbook",
    title: "Guestbook",
    description:
      "Messages from visitors. Reading is open; signing needs a human GitHub login.",
    mimeType: "text/html",
    group: "Pages",
  },
];

const MACHINE_READABLE: AgentResource[] = [
  {
    path: "/llms.txt",
    title: "llms.txt",
    description:
      "This map: what the site is for, when to use it, and every resource on it.",
    mimeType: "text/markdown",
    group: "Machine-readable",
  },
  {
    path: "/llms-full.txt",
    title: "llms-full.txt",
    description:
      "The whole site as one Markdown document — every page and every post inline.",
    mimeType: "text/markdown",
    group: "Machine-readable",
  },
  {
    path: "/.well-known/agent-instructions.md",
    title: "Agent instructions",
    description:
      "When to reach for this site, when not to, and how to call it.",
    mimeType: "text/markdown",
    group: "Machine-readable",
  },
  {
    path: "/.well-known/mcp.json",
    title: "MCP manifest",
    description:
      "Descriptor for the MCP server: endpoint, transport, protocol versions, tools and resources.",
    mimeType: "application/json",
    group: "Machine-readable",
  },
  {
    path: "/sitemap-index.xml",
    title: "Sitemap",
    description: "Every indexable URL on the site.",
    mimeType: "application/xml",
    group: "Machine-readable",
  },
  {
    path: "/robots.txt",
    title: "robots.txt",
    description:
      "Crawl policy. Every named AI crawler is allowed the whole site.",
    mimeType: "text/plain",
    group: "Machine-readable",
  },
  {
    path: "/pgp_key.asc.txt",
    title: "PGP public key",
    description: "Armoured public key for encrypted mail.",
    mimeType: "text/plain",
    group: "Machine-readable",
  },
];

const FEEDS: AgentResource[] = [
  {
    path: "/rss.xml",
    title: "RSS feed",
    description: "Writing, as RSS 2.0.",
    mimeType: "application/rss+xml",
    group: "Feeds",
  },
  {
    path: "/feed.json",
    title: "JSON feed",
    description: "Writing, as JSON Feed 1.1.",
    mimeType: "application/feed+json",
    group: "Feeds",
  },
];

const APIS: AgentResource[] = [
  {
    path: "/mcp",
    title: "MCP server",
    description:
      "Model Context Protocol over Streamable HTTP. POST JSON-RPC; no authentication.",
    mimeType: "application/json",
    group: "APIs",
  },
  {
    path: "/api/spotify/now-playing",
    title: "Now playing",
    description:
      "The track currently playing, or the last one played. JSON, no authentication.",
    mimeType: "application/json",
    group: "APIs",
  },
  {
    path: "/api/spotify/top",
    title: "Top music",
    description:
      "Top tracks and artists over a window. Takes `?range=short_term|medium_term|long_term`.",
    mimeType: "application/json",
    group: "APIs",
  },
  {
    path: "/api/files/list",
    title: "File listing",
    description: "Objects in the public R2 bucket under a `?prefix=`.",
    mimeType: "application/json",
    group: "APIs",
  },
  {
    path: "/api/files/search",
    title: "File search",
    description: "Search the public bucket by name with `?q=`.",
    mimeType: "application/json",
    group: "APIs",
  },
];

export const AGENT_RESOURCES: AgentResource[] = [
  ...PAGES,
  ...MACHINE_READABLE,
  ...FEEDS,
  ...APIS,
];

/** Section order in llms.txt and on /docs. */
export const RESOURCE_GROUPS: ResourceGroup[] = [
  "Pages",
  "Machine-readable",
  "APIs",
  "Feeds",
];

export const resourcesIn = (group: ResourceGroup): AgentResource[] =>
  AGENT_RESOURCES.filter((resource) => resource.group === group);

/** Absolute URL for a catalogue path. */
export function absolute(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/* --- Inputs the builders take instead of importing astro:content ---------- */

export interface AgentSite {
  name: string;
  url: string;
  author: string;
  tagline: string;
  description: string;
}

export interface AgentGuidance {
  summary: string;
  whenToUse: string[];
  whenNotToUse: string[];
  howToCall: string;
}

export interface PostSummary {
  title: string;
  description: string;
  href: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Present only in the llms-full.txt build. */
  body?: string;
}

const bullet = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

function linkList(origin: string, resources: AgentResource[]): string {
  return resources
    .map((resource) => {
      const url = absolute(origin, resource.path);
      const markdown = resource.negotiatesMarkdown ? " Serves Markdown." : "";
      return `- [${resource.title}](${url}): ${resource.description}${markdown}`;
    })
    .join("\n");
}

/**
 * /llms.txt, in the llmstxt.org shape: an H1, a blockquote summary, free prose,
 * then H2 sections of annotated links.
 */
export function buildLlmsTxt(input: {
  site: AgentSite;
  agent: AgentGuidance;
  posts: PostSummary[];
}): string {
  const { site, agent, posts } = input;
  const origin = site.url;

  const sections = RESOURCE_GROUPS.map(
    (group) => `## ${group}\n\n${linkList(origin, resourcesIn(group))}`,
  );

  const writing =
    posts.length > 0
      ? [
          "## Writing",
          "",
          posts
            .map(
              (post) =>
                `- [${post.title}](${absolute(origin, post.href)}) (${post.date}): ${post.description}`,
            )
            .join("\n"),
        ].join("\n")
      : null;

  return [
    `# ${site.name} — ${site.author}`,
    "",
    `> ${agent.summary}`,
    "",
    "## When to use this",
    "",
    bullet(agent.whenToUse),
    "",
    "## When not to use this",
    "",
    bullet(agent.whenNotToUse),
    "",
    "## How to call it",
    "",
    agent.howToCall,
    "",
    ...sections.flatMap((section) => [section, ""]),
    ...(writing ? [writing, ""] : []),
    "## Notes",
    "",
    bullet([
      "Everything is public and read-only. There is no rate limit worth the name; please be reasonable.",
      `Any page marked "Serves Markdown" returns \`text/markdown\` when asked for it, with \`Vary: Accept\` set.`,
      "This file is generated from the same catalogue that builds /docs and the MCP resource list, so the three cannot drift.",
    ]),
    "",
  ].join("\n");
}

/**
 * /.well-known/agent-instructions.md — the same guidance as llms.txt without
 * the site map, for clients that look for a dedicated instruction file.
 */
export function buildAgentInstructions(input: {
  site: AgentSite;
  agent: AgentGuidance;
}): string {
  const { site, agent } = input;

  return [
    `# Agent instructions for ${site.name}`,
    "",
    agent.summary,
    "",
    "## When to use this site",
    "",
    bullet(agent.whenToUse),
    "",
    "## When not to use this site",
    "",
    bullet(agent.whenNotToUse),
    "",
    "## How to call it",
    "",
    agent.howToCall,
    "",
    "## Entry points",
    "",
    bullet([
      `\`${absolute(site.url, "/llms.txt")}\` — the site map, with every resource annotated.`,
      `\`${absolute(site.url, "/mcp")}\` — MCP over Streamable HTTP. POST JSON-RPC, no authentication.`,
      `\`${absolute(site.url, "/docs")}\` — the same endpoints written out with example requests.`,
    ]),
    "",
    "## Ground rules",
    "",
    bullet([
      "Read-only. Nothing here changes state except the guestbook, which needs a human GitHub sign-in.",
      "Attribute anything you quote to " +
        `${site.author} (${site.url}).`,
      "Prefer Markdown: ask for `Accept: text/markdown` and skip the page chrome.",
    ]),
    "",
  ].join("\n");
}

/** The homepage, as Markdown. Mirrors what the HTML says in prose. */
export function buildHomeMarkdown(input: {
  site: AgentSite;
  agent: AgentGuidance;
  /** site.json's bio, which is already Markdown. */
  bio: string;
  stack: { name: string; url: string; primary?: boolean }[];
  posts: PostSummary[];
}): string {
  const { site, agent, bio, stack, posts } = input;
  const named = (primary: boolean) =>
    stack
      .filter((tool) => Boolean(tool.primary) === primary)
      .map((tool) => `[${tool.name}](${tool.url})`)
      .join(", ");

  return [
    `# ${site.author}`,
    "",
    `_${site.tagline}_`,
    "",
    bio,
    "",
    "## Uses",
    "",
    `Day to day: ${named(true)}.`,
    "",
    `Also: ${named(false)}.`,
    "",
    ...(posts.length > 0
      ? [
          "## Recent writing",
          "",
          posts
            .slice(0, 5)
            .map(
              (post) =>
                `- [${post.title}](${absolute(site.url, post.href)}) (${post.date})`,
            )
            .join("\n"),
          "",
        ]
      : []),
    "## Live data",
    "",
    bullet([
      "Currently playing and recent listening come from Spotify — see /music.",
      "The contribution graph and pinned repositories come from GitHub — see /docs.",
      "Files are served from a public Cloudflare R2 bucket — see /files.",
    ]),
    "",
    "## For agents",
    "",
    agent.summary,
    "",
    bullet([
      `Site map: ${absolute(site.url, "/llms.txt")}`,
      `MCP server: ${absolute(site.url, "/mcp")}`,
      `Endpoint reference: ${absolute(site.url, "/docs")}`,
    ]),
    "",
  ].join("\n");
}

/** /blog as Markdown. */
export function buildBlogIndexMarkdown(input: {
  site: AgentSite;
  posts: PostSummary[];
}): string {
  const { site, posts } = input;

  if (posts.length === 0) {
    return [
      "# Writing",
      "",
      "Nothing published yet.",
      "",
      `New posts appear in [the RSS feed](${absolute(site.url, "/rss.xml")}) and [the JSON feed](${absolute(site.url, "/feed.json")}).`,
      "",
    ].join("\n");
  }

  return [
    "# Writing",
    "",
    `${posts.length} post${posts.length === 1 ? "" : "s"}, newest first. Each one serves its Markdown source under \`Accept: text/markdown\`.`,
    "",
    posts
      .map(
        (post) =>
          `- **${post.date}** — [${post.title}](${absolute(site.url, post.href)}): ${post.description}`,
      )
      .join("\n"),
    "",
    `Feeds: [RSS](${absolute(site.url, "/rss.xml")}), [JSON](${absolute(site.url, "/feed.json")}).`,
    "",
  ].join("\n");
}

/**
 * /llms-full.txt — the readable half of the site as one document, so an agent
 * can take the whole thing in a single fetch instead of crawling it.
 *
 * `documents` arrives already rendered by the caller, because the page bodies
 * live in a content collection and the post bodies come off `astro:content`.
 */
export function buildLlmsFullTxt(input: {
  site: AgentSite;
  agent: AgentGuidance;
  documents: { path: string; markdown: string }[];
  posts: PostSummary[];
}): string {
  const { site, agent, documents, posts } = input;
  const rule = "\n\n---\n\n";

  const sections = documents.map(
    ({ path, markdown }) =>
      `<!-- ${absolute(site.url, path)} -->\n\n${markdown.trim()}`,
  );

  const postSections = posts
    .filter((post) => post.body?.trim())
    .map(
      (post) =>
        [
          `<!-- ${absolute(site.url, post.href)} -->`,
          "",
          `# ${post.title}`,
          "",
          `_Published ${post.date}._ ${post.description}`,
          "",
          post.body!.trim(),
        ].join("\n"),
    );

  return [
    [
      `# ${site.name} — ${site.author}, in full`,
      "",
      `> ${agent.summary}`,
      "",
      `Every page and post on the site, concatenated. Generated at request time from the same sources the HTML renders from, so it cannot go stale. The annotated index is at ${absolute(site.url, "/llms.txt")}.`,
    ].join("\n"),
    ...sections,
    ...postSections,
  ].join(rule).concat("\n");
}

/**
 * The 404 body. A dead end is where an agent most needs to be told where to go
 * next, so this is a real recovery document rather than the word "404".
 */
export function buildNotFoundMarkdown(input: {
  site: AgentSite;
  /** The path that missed, so the response says what it was looking for. */
  pathname: string;
}): string {
  const { site, pathname } = input;
  const origin = site.url;

  return [
    "# 404 — Not Found",
    "",
    `\`${pathname}\` does not exist on ${site.name}. Nothing was moved; this path has never been a page here.`,
    "",
    "## Where to look instead",
    "",
    linkList(origin, [
      ...resourcesIn("Machine-readable").filter((resource) =>
        ["/llms.txt", "/sitemap-index.xml"].includes(resource.path),
      ),
      ...resourcesIn("Pages"),
    ]),
    "",
    "## Machine-readable entry points",
    "",
    bullet([
      `\`${absolute(origin, "/llms.txt")}\` — every resource on the site, annotated.`,
      `\`${absolute(origin, "/sitemap-index.xml")}\` — every indexable URL.`,
      `\`${absolute(origin, "/mcp")}\` — MCP server, if you would rather call tools than fetch pages.`,
    ]),
    "",
    "If you followed a link to get here, it was wrong when it was written.",
    "",
  ].join("\n");
}
