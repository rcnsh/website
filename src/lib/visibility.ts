import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { rulesLoader, type Visibility, type VisibilityRules } from "../../shared/visibility.ts";

const rules = rulesLoader(() => getDb().select().from(schema.fileVisibility));

/** The folder rules from D1, memoised per isolate. Throws when D1 cannot be read. */
export const loadRules: () => Promise<VisibilityRules> = rules.load;

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
  rules.forget();
}
