# 0127. The stats year switch is static CSS driven by attributes

`/music/stats` (`src/pages/music/stats.astro`) islands render a panel for every year, and the year switch only chooses which shows. The switch is done by static rules in the page's global style block on `html[data-stats-year]` and `[data-year-match]`; the script only sets `data-stats-year` on `<html>` and marks every element tagged with a matching year. Static rules are hashed into the built page's `style-src`, so they are allowed under the CSP, and with no year chosen or no script, all time shows.

Island markup lands after the script runs, so nothing binds per element. A `MutationObserver` marks newly added island markup for the chosen year, and since observer callbacks run before the next paint, nothing flashes. Chart readouts use delegated document pointer listeners and are `aria-hidden`: a readout repeats each chart's text summary and table, so it is a pointer convenience, not the way to reach a value.

Fallbacks carry `data-skel-years` listing every year choice they stand in for, and the script marks a fallback matching any of them, because year and all-time views have different shapes. The year being built in is still running, so its streak panel has all time's shape.
