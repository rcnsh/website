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
  await db
    .delete(schema.guestbook)
    .where(
      and(
        eq(schema.guestbook.id, id),
        eq(schema.guestbook.githubId, session.githubId),
      ),
    );

  // Unconditional: the delete is scoped, and dropping two keys is cheaper than
  // asking whether it removed anything.
  await invalidate();

  return redirect("/guestbook", 302);
};
