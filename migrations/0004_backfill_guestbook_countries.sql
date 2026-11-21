UPDATE `guestbook` SET `country` = 'GB' WHERE `country` IS NULL;
--> statement-breakpoint
UPDATE `guestbook` SET `country` = 'SG'
WHERE `id` = (
	SELECT `id` FROM `guestbook`
	WHERE `username` = 'rcnsh'
	ORDER BY `created_at` DESC, `id` DESC
	LIMIT 1
);
