import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per message. Signers are identified by their GitHub user id — emails
 * are often private, and the id survives a rename.
 *
 * Messages are append-only: there is no unique constraint on the signer, so a
 * person can sign more than once, and nothing is ever edited in place. What
 * stops the list filling up is the per-day limit in `canPostAt`.
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
