# 0175. Reading progress is pure logic and forces the last heading at the end

`activeHeading` and `readingProgress` in `src/lib/reading-progress.ts` are pure functions, separate from the DOM code. The browser preview harness reports `document.hidden` and never dispatches scroll events, so the scroll logic can only be verified by unit tests.

The active heading is the last one whose top has passed the threshold, except that at the end of the page the last heading is forced active. Headings near the bottom of a post can never scroll as high as the threshold, so they would otherwise never be marked.
