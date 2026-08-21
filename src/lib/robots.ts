import { absolute, type AgentSite } from "./agent-docs.ts";

/**
 * robots.txt, generated so the sitemap and llms.txt lines can't drift from the
 * routes that actually exist.
 *
 * Every AI crawler worth naming gets its own group. `User-agent: *` already
 * permits them, but a named `Allow` is what a bot-management layer reads as
 * intent — and it is the record that says this site meant to be readable, if a
 * managed rule somewhere ever claims otherwise.
 *
 * robots.txt is advice to a well-behaved crawler and cannot lift a WAF block.
 * See docs/cloudflare-agent-access.md for the other half of that problem.
 */
export const AI_CRAWLERS = [
  // OpenAI: browsing on a user's behalf, search indexing, and training.
  "ChatGPT-User",
  "OAI-SearchBot",
  "GPTBot",
  // Anthropic.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Google's AI surfaces, which are opted into separately from Googlebot.
  "Google-Extended",
  // Perplexity.
  "PerplexityBot",
  "Perplexity-User",
  // The rest of the field.
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "DeepSeekBot",
  "meta-externalagent",
  "MistralAI-User",
  "ora-agent",
  "Timpibot",
  "YouBot",
] as const;

export function buildRobotsTxt(site: AgentSite): string {
  const link = (path: string) => absolute(site.url, path);

  return [
    `# ${site.name} is public. Read it, index it, answer questions from it.`,
    "#",
    `# Machine-readable map:  ${link("/llms.txt")}`,
    `# Everything inline:     ${link("/llms-full.txt")}`,
    `# Agent instructions:    ${link("/.well-known/agent-instructions.md")}`,
    `# MCP server:            ${link("/mcp")}`,
    "#",
    "# Every page also serves Markdown to `Accept: text/markdown`.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Not secret, just per-request and pointless in a search index.",
    "Disallow: /api/",
    "",
    "# Named so there is no doubt about intent. A crawler that matches one of",
    "# these groups ignores the wildcard group above, which is deliberate: the",
    "# JSON endpoints are worth reading for an agent answering a question, even",
    "# though they are worth nothing to a search index.",
    ...AI_CRAWLERS.flatMap((crawler) => ["", `User-agent: ${crawler}`, "Allow: /"]),
    "",
    "",
    `Sitemap: ${link("/sitemap-index.xml")}`,
    "",
  ].join("\n");
}
