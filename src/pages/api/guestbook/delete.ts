import { and, eq } from "drizzle-orm";
import type { APIRoute } from "astro";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { invalidate } from "@/lib/guestbook";

export const prerender = false;

// POST-only, same as logout; the explicit origin check covers what
// `security.checkOrigin` exempts — see lib/csrf.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  const session = await getSession(cookies);
  if (!session) return redirect("/guestbook", 302);

  const formData = await request.formData();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return redirect("/guestbook", 302);

  const db = getDb();

  // Scoped to the signer's own githubId, not the row id alone.
  const result = await db
    .delete(schema.guestbook)
    .where(
      and(
        eq(schema.guestbook.id, id),
        eq(schema.guestbook.githubId, session.githubId),
      ),
    );

  // Conditional: a delete that removed nothing cannot have made anything
  // stale, and invalidating unconditionally would let a signed-in caller drop
  // the two keys guarding getStats()'s full scan as fast as they like.
  if (result.meta.changes > 0) await invalidate();

  return redirect("/guestbook", 302);
};
