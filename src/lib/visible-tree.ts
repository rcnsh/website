import type { R2Listing, R2Tree } from "./r2";
import { visibilityOf, type VisibilityRules } from "../../shared/visibility.ts";

/**
 * The bucket as a visitor sees it. A folder's own files show only when it is
 * listed; the folder itself shows when it is listed or leads to something that
 * is, so a listed folder under an unlisted one can still be reached.
 */
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

/**
 * One directory without the tree behind it, for buckets too big to inline.
 * Subfolders can only be judged by their own setting here, so a listed folder
 * under an unlisted one is not reachable in this mode.
 */
export function listedListing(prefix: string, listing: R2Listing, rules: VisibilityRules): R2Listing {
  const listed = visibilityOf(rules, prefix) === "listed";
  const out: R2Listing = {
    folders: listing.folders.filter((name) => visibilityOf(rules, `${prefix}${name}/`) === "listed"),
    files: listed ? listing.files : [],
  };
  if (listed && listing.truncated) out.truncated = true;
  return out;
}
