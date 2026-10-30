import type { APIRoute } from "astro";
import { bucket } from "@/lib/bucket";
import { json, policies, privateNoStore } from "@/lib/http";
import { identify } from "@/lib/owner";

export const prerender = false;

/**
 * One directory of the bucket, from the cached tree — the prefix is the
 * caller's, so a live LIST per request is a bucket scan on tap. Visitors get
 * listed folders only; the owner gets everything.
 */
export const GET: APIRoute = async ({ url, cookies, locals }) => {
  try {
    const { owner } = await identify({ cookies, locals });
    const listing = await bucket.view(owner).listing(url.searchParams.get("prefix"));
    // Hidden folders are refused rather than listed: the live-LIST fallback
    // past the cached tree's cap would otherwise walk into `.thumbs/`.
    if (!listing) {
      return json({ error: "Bad request" }, { status: 400 });
    }
    return json(listing, {
      policy: owner ? privateNoStore : policies.files,
      // Signing in changes the answer; without this the browser keeps serving the visitor copy.
      headers: { vary: "cookie" },
    });
  } catch (error) {
    console.error("[files] list failed", error);
    return json({ folders: [], files: [], error: "Bucket unavailable" });
  }
};
