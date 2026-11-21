CREATE TABLE `file_visibility` (
	`prefix` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `file_visibility` (`prefix`, `visibility`) VALUES
	('', 'unlisted'),
	('audio/', 'listed'),
	('image/', 'listed'),
	('video/', 'listed'),
	('valo/', 'listed'),
	('revision/', 'listed'),
	('ShareX/', 'private');
