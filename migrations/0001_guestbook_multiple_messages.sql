DROP INDEX `guestbook_github_id_unique`;--> statement-breakpoint
CREATE INDEX `guestbook_github_id_created_at_idx` ON `guestbook` (`github_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `guestbook` DROP COLUMN `updated_at`;