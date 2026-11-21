# 0204. The home clock is a static script in the site's time zone

The home page shows the time where the site's owner is: `clock.timeZone` from site.json, not the visitor's zone. `src/components/widgets/Clock.astro` renders statically with its own `<script>` rather than as a `server:defer` island, because Astro hoists component scripts to page load, before a deferred island's HTML exists, so the script would find nothing.

The clock uses the ledger `Figure`'s structure so the row's lines stay aligned. Its time zone and `hour12` reach the script as `data-tz` and `data-hour12` attributes, since importing `src/lib/site.ts` in the client script would ship Zod. The `Intl.DateTimeFormat` instances are built once per setup, not per tick, because constructing a formatter is the slow part of formatting. The `shortOffset` zone name has `GMT` replaced with `UTC`: "GMT+8" reads as British time to most people, and it is a UTC offset.

The seconds bar transitions its scale; when the minute fraction wraps, the script removes the transition, forces a reflow, and restores it, or the bar sweeps leftwards across itself at the minute boundary. `sync` clears the interval, always renders once, and restarts the 1s tick only if Live updates is on, and a page made visible again re-renders while it is off, so a stopped clock shows the correct time, never a stale one.
