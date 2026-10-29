import { env } from "cloudflare:workers";
import { deadline } from "./upstream";

/**
 * Posts read and written straight on the repository's default branch, through
 * the Contents API. A commit there is what publishes: Workers Builds deploys
 * every push to main.
 */

const REPO = "rcnsh/website";
const BRANCH = "main";
const DIR = "src/content/blog";
const API = `https://api.github.com/repos/${REPO}/contents/${DIR}`;

/** The file changed on GitHub after the editor loaded it. */
export class PostConflictError extends Error {}

function headers(): HeadersInit {
  const token = env.BLOG_REPO_TOKEN;
  if (!token) {
    throw new Error(
      "BLOG_REPO_TOKEN is not set. Add a fine-grained token with Contents: write on rcnsh/website to .dev.vars, or as a Worker secret.",
    );
  }

  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rcn.sh",
  };
}

const fileUrl = (slug: string) => `${API}/${slug}.md`;

function decode(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Slugs of every post on the branch, deployed or not. */
export async function listPostSlugs(): Promise<string[]> {
  const response = await fetch(`${API}?ref=${BRANCH}`, { headers: headers(), signal: deadline() });
  if (!response.ok) throw new Error(`GitHub contents list responded ${response.status}`);

  const entries = (await response.json()) as { name: string; type: string }[];
  return entries
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3));
}

/** Null when the post does not exist. */
export async function readPostFile(slug: string): Promise<{ source: string; sha: string } | null> {
  const response = await fetch(`${fileUrl(slug)}?ref=${BRANCH}`, {
    headers: headers(),
    signal: deadline(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub contents read responded ${response.status}`);

  const file = (await response.json()) as { content: string; sha: string };
  return { source: decode(file.content), sha: file.sha };
}

/**
 * Creates the file when `sha` is null, otherwise replaces that exact revision.
 * GitHub refuses both a create over an existing file and an update from a stale
 * sha, which is what keeps two open editors from overwriting each other.
 */
export async function writePostFile(
  slug: string,
  source: string,
  sha: string | null,
  message: string,
): Promise<{ sha: string; commitUrl: string }> {
  const response = await fetch(fileUrl(slug), {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encode(source), branch: BRANCH, ...(sha ? { sha } : {}) }),
    signal: deadline(),
  });

  if (response.status === 409 || response.status === 422) {
    throw new PostConflictError(`GitHub refused the write: ${response.status}`);
  }
  if (!response.ok) throw new Error(`GitHub contents write responded ${response.status}`);

  const result = (await response.json()) as {
    content: { sha: string };
    commit: { html_url: string };
  };
  return { sha: result.content.sha, commitUrl: result.commit.html_url };
}
