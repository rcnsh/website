# 0094. getStats reads a covering country index, not a roll-up table

`getStats()` in `src/lib/guestbook.ts` groups the whole guestbook by country. Without an index its plan is a full `SCAN` plus `USE TEMP B-TREE FOR GROUP BY`, and D1 bills the temp b-tree materialisation too: measured, that is 2N rows read against N for the indexed equivalent.

`migrations/0005_guestbook_country_index.sql` adds `guestbook_country_idx` on `guestbook(country)`, so the query runs as `SCAN guestbook USING COVERING INDEX guestbook_country_idx` and its cost halves. The index costs a fourth written row per INSERT and DELETE, which is noise against D1's 50M rows/month of included writes at one message per signer per day.

## Considered options

A roll-up table maintained alongside the insert would let `getStats` read about 250 rows instead of N. It is not built at the current size: the indexed query is still O(N) and reads every row, so the roll-up becomes worth it only if the guestbook grows large.

See ADR-0093.
