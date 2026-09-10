import { and, eq } from "drizzle-orm";
import type { APIRoute } from "astro";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { invalidate } from "@/lib/guestbook";

export const prerender = false;

// POST-only, same as logout. Astro's `security.checkOrigin` refuses cross-site
// *form* posts, but it exempts non-form content types, so a cross-origin JSON
// POST reaches the handler — see lib/csrf. The explicit check closes that
// rather than leaning on the browser preflighting for us.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  const session = await getSession(cookies);
  if (!session) return redirect("/guestbook", 302);

  const formData = await request.formData();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return redirect("/guestbook", 302);

  const db = getDb();

  // Scoped to the signer's own githubId, not just the row id, so one signed-in
  // user can never delete another's entry by guessing or tampering with the id.
  const result = await db
    .delete(schema.guestbook)
    .where(
      and(
        eq(schema.guestbook.id, id),
        eq(schema.guestbook.githubId, session.githubId),
      ),
    );

  /*
    Conditional, and the condition is the point.

    Being scoped means a foreign or nonexistent id deletes nothing — but it
    still reached this line, and invalidating dropped `guestbook:page:1` and
    `guestbook:stats` anyway. Those two keys are the only thing standing
    between an anonymous /guestbook render and getStats()'s full scan, so a
    signed-in caller could put that scan back on the read path 120 times a
    minute at a cost to themselves of one indexed session lookup and zero rows
    written. The KV write amplification was the sharper edge: 240 writes/min is
    ~10.4M/month against a 1M included allowance.

    A delete that removed nothing cannot have made anything stale.
  */
  if (result.meta.changes > 0) await invalidate();

  return redirect("/guestbook", 302);
};
