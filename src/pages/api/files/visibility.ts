import type { APIRoute } from "astro";
import { requireOwner } from "@/lib/owner";
import { cachedTree, isHiddenKey, normalisePrefix } from "@/lib/r2";
import { loadRules, setRule } from "@/lib/visibility";
import { isVisibility } from "../../../../shared/visibility.ts";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/**
 * For the owner: every folder's own setting, and the whole bucket tree the
 * public island leaves out. Anyone else learns only `{ owner: false }`.
 */
export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
  // Refusing drops a stale hint, so it costs the page a single held load.
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "visitor" });
  if (refused) return refused;

  try {
    const [rules, tree] = await Promise.all([loadRules(), cachedTree()]);
    return json({ owner: true, rules, tree });
  } catch (error) {
    console.error("[files] visibility read failed", error);
    return json({ owner: true, error: "Unavailable" }, 502);
  }
};

/**
 * Sets one folder's visibility: `{ prefix, visibility }`, where a null
 * visibility removes the folder's own setting so it inherits again.
 */
export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "forbidden", sameOrigin: true });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }

  const { prefix: raw, visibility } = (body ?? {}) as { prefix?: unknown; visibility?: unknown };
  if (typeof raw !== "string") return json({ error: "Missing prefix" }, 400);
  if (visibility !== null && !isVisibility(visibility)) return json({ error: "Bad visibility" }, 400);

  // normalisePrefix maps anything unsafe to "", which here would silently
  // retarget the root; only an empty request may mean the root.
  const prefix = normalisePrefix(raw);
  if ((prefix === "" && raw.replace(/\/+/g, "") !== "") || isHiddenKey(prefix)) {
    return json({ error: "Bad prefix" }, 400);
  }

  try {
    await setRule(prefix, visibility);
    return json({ rules: await loadRules() });
  } catch (error) {
    console.error("[files] visibility write failed", prefix, error);
    return json({ error: "Write failed" }, 502);
  }
};
