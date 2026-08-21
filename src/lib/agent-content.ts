import { getCollection, type CollectionEntry } from "astro:content";
import {
  buildAgentInstructions,
  buildBlogIndexMarkdown,
  buildHomeMarkdown,
  buildLlmsFullTxt,
  buildLlmsTxt,
  type AgentGuidance,
  type AgentSite,
  type PostSummary,
} from "@/lib/agent-docs";
import type { McpProviders, PageDocument } from "@/lib/mcp/catalog";
import { getPosts, isoDate, postHref } from "@/lib/blog";
import { agent, home, pages, pinnedRepos, site, stack } from "@/lib/site";

/**
 * Where the pure builders in agent-docs.ts meet the site's real content.
 *
 * One rule holds everything together: a page's Markdown is produced here, once,
 * and then reused by the page itself (when a client asks for
 * `Accept: text/markdown`), by /llms-full.txt, and by the MCP server as the
 * resource with that page's URL. Three consumers, one string — so what an agent
 * reads is by construction what the page says.
 */

export type PageSlug = "about" | "contact" | "privacy" | "docs";

export const agentSite: AgentSite = {
  name: site.name,
  url: site.url,
  author: site.author,
  tagline: site.tagline,
  description: site.description,
};

export const agentGuidance: AgentGuidance = {
  summary: agent.summary,
  whenToUse: [...agent.whenToUse],
  whenNotToUse: [...agent.whenNotToUse],
  howToCall: agent.howToCall,
};

/** A standing page, as one Markdown document: H1, standfirst, then the body. */
export function pageMarkdown(entry: CollectionEntry<"pages">): string {
  return [
    `# ${entry.data.heading}`,
    "",
    ...(entry.data.standfirst ? [entry.data.standfirst, ""] : []),
    (entry.body ?? "").trim(),
    "",
  ].join("\n");
}

export const getPageEntry = async (slug: PageSlug) => {
  const collection = await getCollection("pages");
  const entry = collection.find((candidate) => candidate.id === slug);

  // A missing file is a build-time mistake, not a runtime condition.
  if (!entry) throw new Error(`No page content for "${slug}"`);
  return entry;
};

/** The post shape the builders and the MCP server both take. */
export async function postSummaries(
  options: { withBodies?: boolean } = {},
): Promise<PostSummary[]> {
  const posts = await getPosts();

  return posts.map((post) => ({
    title: post.data.title,
    description: post.data.description,
    href: postHref(post),
    date: isoDate(post.data.pubDate),
    ...(options.withBodies ? { body: post.body ?? "" } : {}),
  }));
}

/**
 * Pages that are chrome around live data rather than prose. They have no
 * Markdown twin to serve, so an agent gets a short description of what the page
 * does and the endpoint that actually holds the data — more useful than a
 * Markdown rendering of three loading skeletons.
 */
const INTERACTIVE: { path: string; title: string; body: string[] }[] = [
  {
    path: "/music",
    title: pages.music.title,
    body: [
      "Live Spotify data: what is playing now, top tracks and artists over three windows, and recently played.",
      "",
      "The page is a client-side browser over two endpoints. For the data itself, call `now_playing` or `top_music`, or fetch `/api/spotify/now-playing` and `/api/spotify/top?range=short_term|medium_term|long_term` directly.",
    ],
  },
  {
    path: "/files",
    title: pages.files.title,
    body: [
      "A browser over a public Cloudflare R2 bucket. Everything in it is public deliberately.",
      "",
      "For the listing, call `search_files`, or fetch `/api/files/list?prefix=` and `/api/files/search?q=` directly. Files themselves are served from `https://upload.rcn.sh`.",
    ],
  },
  {
    path: "/guestbook",
    title: pages.guestbook.title,
    body: [
      "Messages left by visitors, newest first.",
      "",
      "Reading it is open to anyone. Signing it needs a GitHub sign-in completed by a human, and one entry is kept per person — so there is nothing here for an agent to write to.",
    ],
  },
];

/**
 * Every page, as Markdown, in the order they appear in the agent-docs
 * catalogue. `withPostBodies` is off by default because /llms.txt and the MCP
 * resource list only need titles.
 */
export async function pageDocuments(
  options: { withPostBodies?: boolean } = {},
): Promise<PageDocument[]> {
  const posts = await postSummaries({ withBodies: options.withPostBodies });
  const entries = await getCollection("pages");

  const standing = (["about", "contact", "privacy", "docs"] as const).flatMap(
    (slug) => {
      const entry = entries.find((candidate) => candidate.id === slug);
      if (!entry) return [];
      return [
        {
          path: `/${slug}`,
          title: pages[slug].title,
          description: pages[slug].description,
          markdown: pageMarkdown(entry),
        },
      ];
    },
  );

  return [
    {
      path: "/",
      title: "Home",
      description: site.description,
      markdown: buildHomeMarkdown({
        site: agentSite,
        agent: agentGuidance,
        bio: home.bio,
        stack: [...stack],
        posts,
      }),
    },
    ...standing,
    {
      path: "/blog",
      title: pages.blog.title,
      description: pages.blog.description,
      markdown: buildBlogIndexMarkdown({ site: agentSite, posts }),
    },
    ...INTERACTIVE.map((page) => ({
      path: page.path,
      title: page.title,
      description:
        page.path === "/music"
          ? pages.music.description
          : page.path === "/files"
            ? pages.files.description
            : pages.guestbook.description,
      markdown: [`# ${page.title}`, "", ...page.body, ""].join("\n"),
    })),
  ];
}

export const llmsTxt = async (): Promise<string> =>
  buildLlmsTxt({
    site: agentSite,
    agent: agentGuidance,
    posts: await postSummaries(),
  });

export const agentInstructions = (): string =>
  buildAgentInstructions({ site: agentSite, agent: agentGuidance });

export const llmsFullTxt = async (): Promise<string> =>
  buildLlmsFullTxt({
    site: agentSite,
    agent: agentGuidance,
    documents: (await pageDocuments()).map(({ path, markdown }) => ({
      path,
      markdown,
    })),
    posts: await postSummaries({ withBodies: true }),
  });

/**
 * The MCP server's data access, bound to this site.
 *
 * The Spotify, GitHub and R2 modules are imported lazily because each one
 * reaches for a `cloudflare:workers` binding at module scope — pulling them in
 * eagerly would make even `tools/list` depend on bindings it never touches.
 */
export function mcpProviders(): McpProviders {
  return {
    origin: site.url,
    pages: () => pageDocuments({ withPostBodies: true }),
    posts: () => postSummaries({ withBodies: true }),
    llmsTxt,
    llmsFullTxt,
    agentInstructions: async () => agentInstructions(),

    async nowPlaying() {
      const { getNowPlaying, getRecentTracks } = await import("@/lib/spotify");
      const playing = await getNowPlaying();
      if (playing.isPlaying) return playing;

      // Same fallback the home page card makes, so both answer alike.
      const [last] = await getRecentTracks(1);
      return last ? { isPlaying: false, lastPlayed: last } : playing;
    },

    async topMusic(type, range) {
      const { getRecentTracks, getTopArtists, getTopTracks } = await import(
        "@/lib/spotify"
      );

      if (type === "recent") {
        return { type, tracks: await getRecentTracks(20) };
      }
      if (type === "artists") {
        return { type, range, artists: await getTopArtists(range, 20) };
      }
      return { type, range, tracks: await getTopTracks(range, 20) };
    },

    async repos() {
      const { getFeaturedRepos } = await import("@/lib/github");
      // The same set the home page highlights, in the same order.
      return getFeaturedRepos(pinnedRepos, 12);
    },

    async searchFiles(query, limit) {
      const { searchBucket } = await import("@/lib/r2");
      return searchBucket(query, limit);
    },
  };
}
