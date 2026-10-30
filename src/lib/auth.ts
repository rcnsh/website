import { deadline } from "./upstream";
import { eq, lt } from "drizzle-orm";
import { env, waitUntil } from "cloudflare:workers";
import type { AstroCookies } from "astro";
import { getDb, schema } from "./db";
import { COOKIE_PREFIX } from "./cookies";
import { OWNER_HINT_COOKIE, writeOwnerHint } from "./owner-hint";
import { deleteSessionCookie, SESSION_COOKIE, writeSessionCookie } from "./session-cookie";

export { COOKIE_SECURE } from "./cookies";
export { SESSION_COOKIE } from "./session-cookie";

export const OAUTH_STATE_COOKIE = `${COOKIE_PREFIX}rcnsh_oauth_state`;
export const OAUTH_RETURN_COOKIE = `${COOKIE_PREFIX}rcnsh_oauth_return`;

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
 * Expired rows hold profile data and D1 has no TTL, so something must delete
 * them. Sampled from `getSession` rather than run on login, which ties the
 * sweep to traffic. A Cron Trigger would be tidier but @astrojs/cloudflare's
 * generated entry has no hook for a `scheduled` export.
 */
const SWEEP_SAMPLE_RATE = 50;

async function sweepExpiredSessions(): Promise<void> {
  await getDb()
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()));
}

export async function createSession(
  user: SessionUser,
  cookies: AstroCookies,
): Promise<void> {
  const token = randomToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const db = getDb();
  await db.insert(schema.sessions).values({ id, expiresAt, ...user });

  writeSessionCookie(cookies, token, expiresAt, isOwner(user));
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
    deleteSessionCookie(cookies);
    return null;
  }

  const owner = isOwner(row);
  if (row.expiresAt.getTime() - Date.now() < SESSION_REFRESH_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db
      .update(schema.sessions)
      .set({ expiresAt })
      .where(eq(schema.sessions.id, id));

    // Without this the browser still drops the cookie at its original expiry.
    writeSessionCookie(cookies, token, expiresAt, owner);
  } else if (owner && !cookies.has(OWNER_HINT_COOKIE)) {
    // A hint cleared or lost while the session lives comes back on next use.
    writeOwnerHint(cookies, row.expiresAt);
  }

  // Nobody waits on the sweep, and nothing depends on it having run: an
  // unswept expired row is already rejected above.
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

/**
 * The site owner, matched on GitHub's numeric user id from the OWNER_GITHUB_ID
 * var. Unset or malformed means nobody is the owner.
 */
export function isOwner(user: SessionUser | null): boolean {
  const owner = Number(env.OWNER_GITHUB_ID);
  if (!user || !Number.isSafeInteger(owner) || owner <= 0) return false;
  return user.githubId === owner;
}

export async function destroySession(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const id = await hashToken(token);
    await getDb().delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  deleteSessionCookie(cookies);
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
