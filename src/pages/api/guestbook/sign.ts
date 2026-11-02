import type { APIRoute, AstroCookies } from "astro";
import { getSession } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { getDb, schema } from "@/lib/db";
import { invalidate, lastPostedAt } from "@/lib/guestbook";
import { containsProfanity } from "@/lib/profanity";
import { nextAllowedAt } from "@/lib/rate-limit";
import { pages } from "@/lib/site";

export const prerender = false;

const MAX_LENGTH = pages.guestbook.maxMessageLength;

/**
 * The signer's country, straight off the edge. Read from the request because
 * the adapter's typed locals expose only `cfContext`; hence the cast. Null
 * unless two letters: `cf` is absent under `astro dev`, and Tor reports `T1`.
 */
function signerCountry(request: Request): string | null {
  const { cf } = request as Request & { cf?: IncomingRequestCfProperties };
  const code = cf?.country;
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Validates and stores a submission; returns an error code for /guestbook, or null. */
async function sign(request: Request, cookies: AstroCookies, origin: string): Promise<string | null> {
  // `security.checkOrigin` only inspects form-like content types, so a JSON or
  // octet-stream body reached here unchecked and made formData() throw a 500.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return "empty";
  }
  const message = String(formData.get("message") ?? "").trim();

  try {
    const session = await getSession(cookies);
    if (!session) return "auth";
    if (!message) return "empty";
    if (message.length > MAX_LENGTH) return "long";
    if (containsProfanity(message)) return "profanity";

    // The form could have been sitting open since before the last message.
    if (nextAllowedAt(await lastPostedAt(session.githubId))) return "rate";

    await getDb().insert(schema.guestbook).values({
      githubId: session.githubId,
      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      message,
      country: signerCountry(request),
    });

    // The redirect reads both straight back; drop them first.
    await invalidate(origin);
    return null;
  } catch (error) {
    console.error("[guestbook] sign failed", error);
    return "db";
  }
}

// Post/redirect/get, so a reload or Back never re-submits the form. The
// fragment brings the reader back to the form and its status line.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();
  const failed = await sign(request, cookies, url.origin);
  return redirect(failed ? `/guestbook?error=${failed}#gb-sign` : "/guestbook?posted#gb-sign", 303);
};

// Where the router lands a refused post (a 429 or 403 is not HTML, so it
// retries the action as a GET). Back to the form, which keeps the draft.
export const GET: APIRoute = ({ redirect }) => redirect("/guestbook?error=refused#gb-sign", 303);
