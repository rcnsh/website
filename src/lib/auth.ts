import { deadline } from "./upstream";
import { eq, lt } from "drizzle-orm";
import { env, waitUntil } from "cloudflare:workers";
import type { AstroCookies } from "astro";
import { getDb, schema } from "./db";

export const SESSION_COOKIE = "rcnsh_session";
export const OAUTH_STATE_COOKIE = "rcnsh_oauth_state";

const USER_AGENT = "rcn.sh";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
/** Sessions past halfway through their life get extended on use. */
const SESSION_REFRESH_MS = SESSION_TTL_MS / 2;

export type SessionUser = {
  githubId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

// --- GitHub OAuth ---

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set. Add them to .dev.vars locally, or as Worker secrets in production.",
    );
  }

  return { clientId, clientSecret };
}

/** Both legs of the flow must send the same redirect_uri or GitHub rejects it. */
function callbackUrl(origin: string): string {
  return `${origin}/api/auth/callback`;
}

export function createAuthorizationUrl(origin: string, state: string): string {
  const { clientId } = credentials();
  const url = new URL(AUTHORIZE_URL);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("state", state);
  // No scopes: the default grant already reads the public profile.

  return url.toString();
}

/**
 * GitHub answers a spent or forged code with HTTP 200 and an `error` field, so
 * the status alone doesn't tell success from failure.
 */
export async function exchangeCodeForToken(
  origin: string,
  code: string,
): Promise<string> {
  const { clientId, clientSecret } = credentials();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl(origin),
    }),
    // Without a deadline a hung GitHub holds the OAuth callback open and the
    // visitor watches a login that never resolves. callback.ts already turns a
    // throw here into ?error=auth.
    signal: deadline(),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!payload.access_token) {
    const reason = payload.error_description ?? payload.error ?? "no token";
    throw new Error(`GitHub token exchange failed: ${reason}`);
  }

  return payload.access_token;
}

// --- Session tokens ---

/**
 * The raw token goes in the cookie; only its SHA-256 hash is stored. A leaked
 * database therefore can't be used to mint sessions.
 */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same 256 bits of entropy, but it only ever lives in a short-lived cookie. */
export function generateState(): string {
  return randomToken();
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

/**
 * Expired rows hold a githubId, username, display name and avatar URL, and D1
 * has no TTL of its own, so something has to delete them.
 *
 * This ran inside `createSession` originally, meaning it fired only when
 * somebody completed an OAuth login — on a site with infrequent logins that
 * lets rows outlive their 30-day TTL indefinitely, and then makes one unlucky
 * login pay for the entire accumulated backlog in a single statement.
 * Sampling it from `getSession` ties it to traffic instead.
 *
 * A Cron Trigger is the tidier shape and is not available here:
 * @astrojs/cloudflare registers with `entrypointResolution: "auto"` and its
 * generated entry is `{ fetch: handle }`, with no hook for a `scheduled`
 * export. The alternatives were a Worker of its own for one DELETE, or
 * patching the adapter's build output — both disproportionate to a table that
 * holds a handful of rows.
 *
 * `sessions_expires_at_idx` covers the predicate, so this is a cheap indexed
 * range delete rather than a scan.
 */
const SWEEP_SAMPLE_RATE = 50;

async function sweepExpiredSessions(): Promise<void> {
  await getDb()
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()));
}

/**
 * Whether cookies get the `Secure` flag. Deriving this from the request scheme
 * looks equivalent and is not: rcn.sh answers plain http unless the zone has
 * *Always Use HTTPS* on, and a first-ever visitor who lands on http:// would
 * be handed a session cookie without `Secure`, then send it in the clear on
 * every later http request. HSTS closes that for anyone who has already
 * visited over https; it cannot help the first navigation. So the flag is
 * unconditional in anything that is not a local dev build.
 */
export const COOKIE_SECURE = !import.meta.env.DEV;

export async function createSession(
  user: SessionUser,
  cookies: AstroCookies,
): Promise<void> {
  const token = randomToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const db = getDb();
  // One statement, one round trip. The expired-row sweep used to follow this
  // insert, which made it a second serialised trip to D1 inside the OAuth
  // callback with the user waiting on both. It is sampled from getSession now.
  await db.insert(schema.sessions).values({ id, expiresAt, ...user });

  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: COOKIE_SECURE,
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

  /*
    Roughly one signed-in request in fifty triggers the cleanup, and none of
    them wait for it: `waitUntil` keeps the Worker alive past the response, so
    this costs the caller nothing but a scheduled continuation. Nothing depends
    on it having run — an unswept expired row is already rejected above — so a
    failure is logged rather than propagated.
  */
  if (Math.floor(Math.random() * SWEEP_SAMPLE_RATE) === 0) {
    waitUntil(
      sweepExpiredSessions().catch((error) => {
        console.error("[auth] session sweep failed", error);
      }),
    );
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

// --- GitHub profile ---

export async function fetchGitHubUser(accessToken: string): Promise<SessionUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
    },
    signal: deadline(),
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
