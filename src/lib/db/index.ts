import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "./schema";

/** Drizzle bound to the D1 database. */
export function getDb() {
  if (!env.DB) {
    throw new Error(
      "D1 binding `DB` is missing. Create the database and set database_id in wrangler.jsonc.",
    );
  }
  return drizzle(env.DB, { schema });
}

export { schema };
