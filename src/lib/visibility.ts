import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { rulesLoader, type Visibility, type VisibilityRules } from "../../shared/visibility.ts";

const rules = rulesLoader(() => getDb().select().from(schema.fileVisibility));

export const loadRules: () => Promise<VisibilityRules> = rules.load;

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
