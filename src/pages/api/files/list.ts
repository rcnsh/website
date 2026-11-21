import type { APIRoute } from "astro";
import { bucket } from "@/lib/bucket";
import { json, policies, privateNoStore } from "@/lib/http";
import { identify } from "@/lib/owner";

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, locals }) => {
  try {
    const { owner } = await identify({ cookies, locals });
    const listing = await bucket.view(owner).listing(url.searchParams.get("prefix"));
    if (!listing) {
      return json({ error: "Bad request" }, { status: 400 });
    }
    return json(listing, {
      policy: owner ? privateNoStore : policies.files,
      headers: { vary: "cookie" },
    });
  } catch (error) {
    console.error("[files] list failed", error);
    return json({ folders: [], files: [], error: "Bucket unavailable" });
  }
};
