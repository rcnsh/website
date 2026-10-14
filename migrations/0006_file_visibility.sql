CREATE TABLE `file_visibility` (
	`prefix` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- Starting state. Folders with no row inherit from the root, so anything
-- uploaded later (ShareX, backups) stays unlisted until chosen otherwise.
-- OR IGNORE: a replay must not undo a setting changed since.
INSERT OR IGNORE INTO `file_visibility` (`prefix`, `visibility`) VALUES
	('', 'unlisted'),
	('audio/', 'listed'),
	('image/', 'listed'),
	('video/', 'listed'),
	('valo/', 'listed'),
	('revision/', 'listed'),
	('ShareX/', 'private');
