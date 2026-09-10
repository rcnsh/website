import { env } from "cloudflare:workers";

/**
 * Per-client budgets against denial-of-wallet, not a security control — the
 * routes are public. Counters are per Cloudflare location, so this bounds one
 * host, not a botnet; a distributed flood needs a WAF rule. See docs/abuse.md.
 */

/** How long a throttled caller is told to wait. Matches the window below. */
const WINDOW_SECONDS = 60;

/** Each its own namespace in wrangler.jsonc, limited per minute. */
type Bucket = "scan" | "auth" | "api";

function limiter(bucket: Bucket): RateLimit | undefined {
  switch (bucket) {
    case "scan":
      return env.SCAN_BUDGET;
    case "auth":
      return env.AUTH_BUDGET;
    case "api":
      return env.API_BUDGET;
  }
}

/**
 * Which bucket a path spends from; specific prefixes before the catch-all.
 *
 * `scan` is every route that reads and parses the whole cached bucket tree out
 * of KV — that read dominates, so all of them belong on the same tight budget.
 */
export function bucketFor(pathname: string): Bucket {
  if (pathname.startsWith("/api/files/")) return "scan";
  if (pathname.startsWith("/_server-islands/FilesRoot")) return "scan";
  if (pathname.startsWith("/api/auth/")) return "auth";
  return "api";
}

/**
 * The caller, as far as the edge knows; not spoofable from outside. An IP
 * rather than a user id on purpose: the flood is what is being metered, and
 * the limits are loose enough that carrier NAT does not trip them.
 */
function client(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

/**
 * A 429 when this caller has spent its budget for the path, otherwise null.
 *
 * Fails open on every unexpected condition: a cost control that can take the
 * site down when it misfires is worse than the bill it prevents.
 */
export async function throttle(
  request: Request,
  pathname: string,
): Promise<Response | null> {
  try {
    // Before touching `env`: null when prerendering and under `astro dev`,
    // which is exactly where the bindings do not exist.
    const key = client(request);
    if (!key) return null;

    const budget = limiter(bucketFor(pathname));
    if (!budget) return null;

    const { success } = await budget.limit({ key });
    if (success) return null;
  } catch (error) {
    console.error("[throttle] limiter failed, allowing", error);
    return null;
  }

  return new Response("Too many requests", {
    status: 429,
    headers: {
      "retry-after": String(WINDOW_SECONDS),
      // Never let a 429 be cached and served to someone else.
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
