# 0126. Music stats formatting and chart geometry live in a pure module

Formatting and chart geometry for `/music/stats` live in `src/lib/music-stats-view.ts`, which has no dependencies, so it tests under `node --test`. The components only lay out its results.

Its formatting rules are recorded there with tests. One is that a share between 0% and 1% is shown with one decimal, since otherwise every small share reads "0%".
