import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per message, keyed to a GitHub user id — it survives a rename.
 * Append-only and not unique per signer; `canPostAt` is what bounds the list.
 */
export const guestbook = sqliteTable(
  "guestbook",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubId: integer("github_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    message: text("message").notNull(),
    /**
     * ISO 3166-1 alpha-2, from `request.cf.country`. Nullable: imported rows
     * predate it, Workers sometimes omits it, and Tor reports `T1`.
     */
    country: text("country"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("guestbook_created_at_idx").on(table.createdAt),
    // Covers the rate-limit lookup: newest message for one signer.
    index("guestbook_github_id_created_at_idx").on(table.githubId, table.createdAt),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    githubId: integer("github_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("sessions_expires_at_idx").on(table.expiresAt)],
);

export type GuestbookEntry = typeof guestbook.$inferSelect;
export type Session = typeof sessions.$inferSelect;
