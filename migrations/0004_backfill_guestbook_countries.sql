-- Locations for the entries that predate the `country` column.
--
-- Every signature carried over in 0002 was left while I was in Newcastle, so
-- they are all GB. The one exception is my own most recent message, written
-- after the move to Singapore.
--
-- Scoped to `country IS NULL` so this can only ever fill in the backlog — a
-- country captured from `request.cf` at signing time is never overwritten.
UPDATE `guestbook` SET `country` = 'GB' WHERE `country` IS NULL;
--> statement-breakpoint
-- Newest first, then by id, so a same-second tie still resolves to one row.
UPDATE `guestbook` SET `country` = 'SG'
WHERE `id` = (
	SELECT `id` FROM `guestbook`
	WHERE `username` = 'rcnsh'
	ORDER BY `created_at` DESC, `id` DESC
	LIMIT 1
);
