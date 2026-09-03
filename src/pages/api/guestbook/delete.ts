import { and, eq } from "drizzle-orm";
import type { APIRoute } from "astro";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { invalidate } from "@/lib/guestbook";

export const prerender = false;

// POST-only, same as logout: a cross-site POST is already refused upstream by
// Astro's `security.checkOrigin`, which is on by default, so there is no
// origin check to repeat here.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
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
