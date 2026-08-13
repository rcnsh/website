import { GitHub, generateState } from "arctic";
import { eq, lt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import type { AstroCookies } from "astro";
import { getDb, schema } from "./db";

export const SESSION_COOKIE = "rcnsh_session";
export const OAUTH_STATE_COOKIE = "rcnsh_oauth_state";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
/** Sessions past halfway through their life get extended on use. */
const SESSION_REFRESH_MS = SESSION_TTL_MS / 2;

export type SessionUser = {
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function getGitHubClient(origin: string) {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set. Add them to .dev.vars locally, or as Worker secrets in production.",
    );
  }

  return new GitHub(clientId, clientSecret, `${origin}/api/auth/callback`);
}

export { generateState };

/* -------------------------------------------------------------------------- */
/* Session tokens                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The raw token goes in the cookie; only its SHA-256 hash is stored. A leaked
 * database therefore can't be used to mint sessions.
 */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createSession(
  user: SessionUser,
  cookies: AstroCookies,
  secure: boolean,
): Promise<void> {
  const token = randomToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const db = getDb();
  await db.insert(schema.sessions).values({ id, expiresAt, ...user });

  // Opportunistically sweep expired rows; D1 has no TTL of its own.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));

  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    expires: expiresAt,
  });
}

export async function getSession(
  cookies: AstroCookies,
): Promise<SessionUser | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = await hashToken(token);
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return null;
  }

  if (row.expiresAt.getTime() - Date.now() < SESSION_REFRESH_MS) {
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(schema.sessions.id, id));
  }

  return {
    githubId: row.githubId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
  };
}

export async function destroySession(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const id = await hashToken(token);
    await getDb().delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

/* -------------------------------------------------------------------------- */
/* GitHub profile                                                              */
/* -------------------------------------------------------------------------- */

export async function fetchGitHubUser(accessToken: string): Promise<SessionUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "rcn.sh",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user lookup failed: ${response.status}`);
  }

  const profile = (await response.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    githubId: profile.id,
    username: profile.login,
    displayName: profile.name,
    avatarUrl: profile.avatar_url,
  };
}
