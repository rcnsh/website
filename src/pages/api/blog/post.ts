import type { APIRoute } from "astro";
import { getSession, isOwner } from "@/lib/auth";
import { PostConflictError, writePostFile } from "@/lib/blog-repo";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { isSlug } from "@/lib/post-slug";
import { postInput, serialisePost } from "@/lib/post-source";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/**
 * Commits one post: `{ slug, sha, ...fields, body }`. A null `sha` creates the
 * file and is refused if it already exists; otherwise `sha` must be the
 * revision the editor loaded.
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();
  if (!isOwner(await getSession(cookies))) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const { slug, sha, ...rest } = (body ?? {}) as { slug?: unknown; sha?: unknown };
  if (!isSlug(slug)) return json({ error: "Slugs are lowercase letters, digits and single hyphens" }, 400);
  if (sha !== null && typeof sha !== "string") return json({ error: "Bad sha" }, 400);

  const parsed = postInput.safeParse(rest);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ error: `${issue?.path.join(".") || "post"}: ${issue?.message ?? "invalid"}` }, 400);
  }

  const message = `chore(blog): ${sha ? "update" : "add"} ${slug}`;

  try {
    const result = await writePostFile(slug, serialisePost(parsed.data), sha, message);
    return json(result);
  } catch (error) {
    if (error instanceof PostConflictError) {
      return json(
        {
          error: sha
            ? "This post changed on GitHub since you opened it. Copy your text, reload, and reapply it."
            : "A post with this slug already exists.",
        },
        409,
      );
    }
    console.error("[blog] commit failed", slug, error);
    return json({ error: "GitHub refused the commit. Check BLOG_REPO_TOKEN." }, 502);
  }
};
