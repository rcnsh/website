# 0129. Stats charts share scales and label axes by the data's real extent

Several `/music/stats` charts would mislead if each part were scaled or labelled on its own.

All on-repeat sparklines (`src/components/music/stats/OnRepeat.astro`) share one peak, the maximum daily count across every track; a per-row scale would make bars of different heights mean the same count, so rows could not be compared. The last point of a series is labelled "yesterday", because the warehouse's daily series ends at local midnight and never includes today.

The time-of-day heatmap's intensity is `sqrt(value / max)` (`src/lib/music-stats-view.ts`). A linear scale washes the quiet small hours out next to a busy afternoon, so they look like nothing at all.

The top-over-time x axis (`src/components/music/stats/TopOverTime.astro`) labels each Q1 with its year, and labels the first column too only when it is far enough from the next label. History starts mid-year, so the first column may not be a Q1, and two labels too close together run into each other.
