# 0179. Writing figures are computed from plain post data, in UTC

The writing page's figures in `src/lib/writing.ts` take plain post data rather than collection entries, so they run under `node --test` without `astro:content`. For the same reason `readingTime` and `wordCount` live in `src/lib/utils.ts` rather than `src/lib/blog.ts`: `scripts/generate-og.ts` imports `readingTime` and must not pull in `astro:content`. `readingTime` is `wordCount` divided by `WORDS_PER_MINUTE` (200), and `src/lib/writing.ts` re-exports `wordCount`, so the word count and the minutes on a post cannot disagree. The count is rough by design, dropping code and counting the rest as whitespace tokens.

Cadence months are the UTC year and 0-based month. `pubDate` is a UTC midnight, so local time would shift posts into the previous month.
