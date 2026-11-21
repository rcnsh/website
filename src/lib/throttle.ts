import { env } from "cloudflare:workers";
import { noStore } from "../../shared/cache-policy.ts";

const WINDOW_SECONDS = 60;

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

export function bucketFor(pathname: string): Bucket {
  if (
    pathname === "/api/files/meta" ||
    pathname === "/api/files/thumbs" ||
    pathname === "/api/files/download"
  ) {
    return "api";
  }
  if (pathname.startsWith("/api/files/")) return "scan";
  if (pathname.startsWith("/_server-islands/FilesRoot")) return "scan";
  if (pathname.startsWith("/api/auth/")) return "auth";
  return "api";
}

function client(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

export async function throttle(
  request: Request,
  pathname: string,
): Promise<Response | null> {
  try {
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
      "cache-control": noStore,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
