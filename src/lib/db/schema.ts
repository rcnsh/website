import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const guestbook = sqliteTable(
  "guestbook",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubId: integer("github_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    message: text("message").notNull(),
    country: text("country"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("guestbook_created_at_idx").on(table.createdAt),
    index("guestbook_github_id_created_at_idx").on(table.githubId, table.createdAt),
    index("guestbook_country_idx").on(table.country),
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

export const fileVisibility = sqliteTable("file_visibility", {
  prefix: text("prefix").primaryKey(),
  visibility: text("visibility", { enum: ["listed", "unlisted", "private"] }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type GuestbookEntry = typeof guestbook.$inferSelect;
export type Session = typeof sessions.$inferSelect;
