import { env } from "cloudflare:workers";

/**
 * Per-client budgets for the routes that cost money, checked in the middleware
 * before anything expensive runs.
 *
 * The threat is a denial-of-wallet: Workers bills per request and per CPU
 * millisecond with no spend ceiling, so a script that can reach a route which
 * scans the file tree or queries D1 is turning someone else's bandwidth into
 * this account's invoice. Nothing here is a security control — the routes are
 * public and meant to be — it is a meter.
 *
 * Backed by the Rate Limiting API, which is counted in the same isolate the
 * Worker already runs in: no subrequest, no binding round trip, and no charge
 * of its own. Two things follow from that and both matter:
 *
 *   - Counters are per Cloudflare location. A caller spread across colos gets
 *     the limit once per colo, so this bounds one host, not a botnet. The
 *     ceiling for a distributed flood is a WAF rate limiting rule, which runs
 *     ahead of the Worker and so costs nothing at all. See docs/abuse.md.
 *   - It is eventually consistent and deliberately permissive. Limits are set
 *     well above what the site's own JavaScript asks for, so overshoot on the
 *     honest side is free.
 */

/** How long a throttled caller is told to wait. Matches the window below. */
const WINDOW_SECONDS = 60;

/**
 * The buckets, each its own namespace in wrangler.jsonc. Limits are per minute
 * and sized against what one reader's browser actually does — the file browser
 * debounces its search, NowPlaying polls every 20s — with a wide margin over
 * that, so tripping one takes deliberate effort.
 */
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
 * Which bucket a path spends from. Order matters: the specific prefixes are
 * tested before the catch-all.
 *
 * `/api/files/search` is alone in `scan` because it is the one route whose
 * cost is not flat — it reads the whole cached bucket tree out of KV and walks
 * every key in it, so each call is milliseconds of CPU rather than fractions
 * of one, and CPU past the included 30M ms/month is $0.02 per million.
 */
export function bucketFor(pathname: string): Bucket {
  if (pathname === "/api/files/search") return "scan";
  if (pathname.startsWith("/api/auth/")) return "auth";
  return "api";
}

/**
 * The caller, as far as the edge knows. Cloudflare sets this on every request
 * that reaches a Worker; the header cannot be spoofed from outside.
 *
 * Cloudflare's own guidance is to prefer a user id over an IP, because one IP
 * can be a whole office or carrier NAT. That advice is about fairness between
 * customers of an API. This is about a flood, where the IP is precisely the
 * thing doing the flooding, and the limits are loose enough that a shared exit
 * would have to carry dozens of simultaneous readers to notice.
 */
function client(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

/**
 * A 429 when this caller has spent its budget for the path, otherwise null.
 *
 * Fails open on every unexpected condition — a missing binding in dev, a
 * missing client address, a limiter that throws. A cost control that can take
 * the site down when it misfires is a worse outage than the bill it prevents,
 * and the WAF sits behind it either way.
 */
export async function throttle(
  request: Request,
  pathname: string,
): Promise<Response | null> {
  try {
    /* First, and before touching `env`: this is null during prerendering and
       under `astro dev`, which is exactly where the bindings do not exist. */
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
