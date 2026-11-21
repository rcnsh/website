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

function signerCountry(request: Request): string | null {
  const { cf } = request as Request & { cf?: IncomingRequestCfProperties };
  const code = cf?.country;
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) ? code : null;
}

async function sign(request: Request, cookies: AstroCookies, origin: string): Promise<string | null> {
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

    if (nextAllowedAt(await lastPostedAt(session.githubId))) return "rate";

    await getDb().insert(schema.guestbook).values({
      githubId: session.githubId,
      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      message,
      country: signerCountry(request),
    });

    await invalidate(origin);
    return null;
  } catch (error) {
    console.error("[guestbook] sign failed", error);
    return "db";
  }
}

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();
  const failed = await sign(request, cookies, url.origin);
  return redirect(failed ? `/guestbook?error=${failed}#gb-sign` : "/guestbook?posted#gb-sign", 303);
};

export const GET: APIRoute = ({ redirect }) => redirect("/guestbook?error=refused#gb-sign", 303);
