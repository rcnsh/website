-- Guestbook entries carried over from the previous site.
--
-- The old guestbook identified signers by email; this one keys on the GitHub
-- user id, so each entry was matched to its author's GitHub account and the
-- emails were dropped (there is nowhere to put them, and no reason to).
--
-- 0001 dropped the one-row-per-signer constraint, so these sit alongside
-- anything already in the table rather than replacing it.
--
-- Guarded rather than a plain INSERT. `wrangler d1 migrations apply` records
-- applied migrations by name and skips them, so in the normal flow this only
-- ever runs once — but unlike the DDL migrations either side of it, a replay
-- here does not fail loudly. It used to succeed in silence and double every
-- imported row. The exposure is a hand-run `d1 execute --file`, or a restore
-- that reseeds data without the ledger, and the consequence is worse than
-- duplicates: entries whose authors have since deleted them through
-- /api/guestbook/delete would come back.
--
-- (github_id, created_at) is the identity here. Neither is unique on its own —
-- a signer may post repeatedly — but the pair is stable for an imported row
-- and cannot be re-minted, since new entries take created_at from unixepoch()
-- at insert time.
INSERT INTO `guestbook`
	(`github_id`, `username`, `display_name`, `avatar_url`, `message`, `created_at`)
SELECT `column1`, `column2`, `column3`, `column4`, `column5`, `column6`
FROM (VALUES
(49075095, 'rcnsh', 'jacob', 'https://avatars.githubusercontent.com/u/49075095?v=4', 'omg guys', 1710342780),
	(35573377, 'Thomas-Hawkins', 'Thomas', 'https://avatars.githubusercontent.com/u/35573377?v=4', 'As written! He must be Lisan al Gaib!', 1710351480),
	(108481836, 'kalebhirshfield', 'Kaleb Hirshfield', 'https://avatars.githubusercontent.com/u/108481836?v=4', 'kalebhirshfield.com 🥵', 1710359700),
	(144437493, 'TopatoKing', 'Henry Smith', 'https://avatars.githubusercontent.com/u/144437493?v=4', '“Anything is possible until your heart stops beating” - Gabriel Stokes', 1710360900),
	(163353379, 'ArmourFarmer', NULL, 'https://avatars.githubusercontent.com/u/163353379?v=4', '.-- .... -.-- / -.. .. -.. / -.-- --- ..- / - .-. .- -. ... .-.. .- - . / - .... .. ...', 1710364680),
	(116298492, 'SamWylie262', NULL, 'https://avatars.githubusercontent.com/u/116298492?v=4', 'bust', 1710508320),
	(163545570, 'LouisBarlow', 'Louis Barlow', 'https://avatars.githubusercontent.com/u/163545570?v=4', 'FREE YOUNG THUG FREE JEFFERY FREE YSL', 1710509040),
	(72267845, 'LucIsTheDude', 'Luc', 'https://avatars.githubusercontent.com/u/72267845?v=4', 'MUAD’DIB WILL LEAD US TO PARADISE', 1710512580),
	(165313169, 'DarkP0G', NULL, 'https://avatars.githubusercontent.com/u/165313169?v=4', 'i left a message. u happy now', 1711647720),
	(52380674, 'hopperelec', 'hopperelec', 'https://avatars.githubusercontent.com/u/52380674?v=4', 'this is an epic test', 1725292942),
	(182643854, 'stavrosnic', NULL, 'https://avatars.githubusercontent.com/u/182643854?v=4', 'i like thus', 1727188092),
	(41600194, 'AzureAqua', NULL, 'https://avatars.githubusercontent.com/u/41600194?v=4', 'you have 1 new message', 1740576231),
	(28310208, 'Reasonlesss', 'Reason', 'https://avatars.githubusercontent.com/u/28310208?v=4', 'guh', 1740576306)
) AS `v`
WHERE NOT EXISTS (
	SELECT 1 FROM `guestbook` `g`
	WHERE `g`.`github_id` = `v`.`column1` AND `g`.`created_at` = `v`.`column6`
);
