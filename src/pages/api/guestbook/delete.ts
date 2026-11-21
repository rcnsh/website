import { and, eq } from "drizzle-orm";
import type { APIRoute } from "astro";
import { getSession, type SessionUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { invalidate } from "@/lib/guestbook";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();

  let session: SessionUser | null;
  let id: number;
  try {
    session = await getSession(cookies);
    id = Number((await request.formData()).get("id"));
  } catch {
    return redirect("/guestbook", 302);
  }
  if (!session || !Number.isInteger(id)) return redirect("/guestbook", 302);

  const db = getDb();

  const [removed] = await db
    .delete(schema.guestbook)
    .where(
      and(
        eq(schema.guestbook.id, id),
        eq(schema.guestbook.githubId, session.githubId),
      ),
    )
    .returning({ id: schema.guestbook.id, createdAt: schema.guestbook.createdAt });

  if (removed) {
    await invalidate(url.origin, {
      createdAt: Math.floor(removed.createdAt.getTime() / 1000),
      id: removed.id,
    });
  }

  return redirect("/guestbook", 302);
};

export const GET: APIRoute = ({ redirect }) => redirect("/guestbook", 302);
