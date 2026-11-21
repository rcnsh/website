# 0130. A running listening streak is reported in whole weeks

The warehouse reports a streak that is still running in whole weeks only, with `days` null, because an exact day count would date the streak's first day. The streak schema in `src/lib/music-stats.ts` therefore makes `days` nullable, where null means still running and only `weeks` is given.

`StreaksPanel` (`src/components/music/stats/StreaksPanel.astro`) takes a `live` prop marking a span that runs to now, since only such a span can hold an unfinished streak. A running streak is drawn at `weeks * 7` days and labelled "N weeks+".
