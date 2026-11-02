import type { APIRoute } from "astro";
import { getSession, type SessionUser } from "@/lib/auth";
import { lastPostedAt } from "@/lib/guestbook";
import type { SignerView } from "@/lib/guestbook-signer";
import { privateJson } from "@/lib/http";
import { nextAllowedAt } from "@/lib/rate-limit";

export const prerender = false;

/** Who is reading /guestbook, which is prerendered and so cannot say. */
export const GET: APIRoute = async ({ cookies }) => {
  let session: SessionUser | null;
  try {
    session = await getSession(cookies);
  } catch (error) {
    console.error("[guestbook] session lookup failed", error);
    return privateJson({ error: true }, 503);
  }
  if (!session) return privateJson({ signer: null, nextPostAt: null } satisfies SignerView);

  let nextPostAt: number | null = null;
  try {
    nextPostAt = nextAllowedAt(await lastPostedAt(session.githubId))?.getTime() ?? null;
  } catch (error) {
    // Signing re-checks, so the limit still holds.
    console.error("[guestbook] rate-limit lookup failed", error);
  }
  const { githubId, username, avatarUrl } = session;
  return privateJson({ signer: { githubId, username, avatarUrl }, nextPostAt } satisfies SignerView);
};
