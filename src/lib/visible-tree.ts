import type { R2Listing, R2Tree } from "./r2";
import { visibilityOf, type VisibilityRules } from "../../shared/visibility.ts";

export function listedTree(tree: R2Tree, rules: VisibilityRules): R2Tree {
  const out: R2Tree = {};

  const visit = (prefix: string): boolean => {
    const listing = tree[prefix] ?? { folders: [], files: [] };
    const listed = visibilityOf(rules, prefix) === "listed";
    const folders = listing.folders.filter((name) => visit(`${prefix}${name}/`));
    const files = listed ? listing.files : [];
    if (!listed && folders.length === 0) return false;

    out[prefix] = { folders, files };
    if (listed && listing.truncated) out[prefix].truncated = true;
    return true;
  };

  if (!visit("")) out[""] = { folders: [], files: [] };
  return out;
}

export function listedListing(prefix: string, listing: R2Listing, rules: VisibilityRules): R2Listing {
  const listed = visibilityOf(rules, prefix) === "listed";
  const out: R2Listing = {
    folders: listing.folders.filter((name) => visibilityOf(rules, `${prefix}${name}/`) === "listed"),
    files: listed ? listing.files : [],
  };
  if (listed && listing.truncated) out.truncated = true;
  return out;
}
