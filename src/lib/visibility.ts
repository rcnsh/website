import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { cachedTree, listDirectory, type R2Listing } from "./r2";
import { listedListing, listedTree } from "./visible-tree";
import { parseRules, type Visibility, type VisibilityRules } from "../../shared/visibility.ts";

/**
 * How long one isolate trusts its copy of the rules. Changes made here clear
 * it at once; other isolates catch up within this window.
 */
const RULES_FRESH_MS = 10_000;

let memo: { rules: VisibilityRules; at: number } | null = null;

/**
 * The folder rules from D1. Throws rather than returning `{}` on failure:
 * empty rules would apply the default to every folder, and a caller that
 * cannot read the rules must refuse, not guess.
 */
export async function loadRules(): Promise<VisibilityRules> {
  if (memo && Date.now() - memo.at < RULES_FRESH_MS) return memo.rules;
  const rows = await getDb().select().from(schema.fileVisibility);
  const rules = parseRules(rows);
  memo = { rules, at: Date.now() };
  return rules;
}

/** Sets a folder's own visibility, or clears it (null) so it inherits again. */
export async function setRule(prefix: string, visibility: Visibility | null): Promise<void> {
  const db = getDb();
  if (visibility === null) {
    await db.delete(schema.fileVisibility).where(eq(schema.fileVisibility.prefix, prefix));
  } else {
    const updatedAt = new Date();
    await db
      .insert(schema.fileVisibility)
      .values({ prefix, visibility, updatedAt })
      .onConflictDoUpdate({
        target: schema.fileVisibility.prefix,
        set: { visibility, updatedAt },
      });
  }
  memo = null;
}

/** The whole tree a visitor may see, or null when the bucket is too big to inline. */
export async function visitorTree(rules: VisibilityRules) {
  const tree = await cachedTree();
  return tree ? listedTree(tree, rules) : null;
}

/** One directory as a visitor sees it, from the tree where there is one. */
export async function visitorDirectory(prefix: string, rules: VisibilityRules): Promise<R2Listing> {
  const tree = await cachedTree();
  if (!tree) return listedListing(prefix, await listDirectory(prefix), rules);
  return listedTree(tree, rules)[prefix] ?? { folders: [], files: [] };
}
