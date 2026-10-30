import type { APIRoute } from "astro";
import { bucket } from "@/lib/bucket";
import { privateJson } from "@/lib/http";
import { requireOwner } from "@/lib/owner";
import { loadRules, setRule } from "@/lib/visibility";
import { folderPrefix } from "../../../../shared/bucket-keys.ts";
import { isVisibility } from "../../../../shared/visibility.ts";

export const prerender = false;

/**
 * For the owner: every folder's own setting, and the whole bucket tree the
 * public island leaves out. Anyone else learns only `{ owner: false }`.
 */
export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
  // Refusing drops a stale hint, so it costs the page a single held load.
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "visitor" });
  if (refused) return refused;

  try {
    const [rules, tree] = await Promise.all([loadRules(), bucket.view(true).tree()]);
    return privateJson({ owner: true, rules, tree });
  } catch (error) {
    console.error("[files] visibility read failed", error);
    return privateJson({ owner: true, error: "Unavailable" }, 502);
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
    return privateJson({ error: "Expected JSON" }, 400);
  }

  const { prefix: raw, visibility } = (body ?? {}) as { prefix?: unknown; visibility?: unknown };
  if (typeof raw !== "string") return privateJson({ error: "Missing prefix" }, 400);
  if (visibility !== null && !isVisibility(visibility)) return privateJson({ error: "Bad visibility" }, 400);

  const prefix = folderPrefix(raw);
  if (prefix === null) return privateJson({ error: "Bad prefix" }, 400);

  try {
    await setRule(prefix, visibility);
    return privateJson({ rules: await loadRules() });
  } catch (error) {
    console.error("[files] visibility write failed", prefix, error);
    return privateJson({ error: "Write failed" }, 502);
  }
};
