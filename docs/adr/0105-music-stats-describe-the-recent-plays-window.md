# 0105. Music stats describe exactly the recent plays listed

`src/lib/listening.ts` derives the music stats tile (`summarise`) from the recent-plays window only, and imports nothing so it tests under `node --test`. `RECENT_WINDOW = 50` is how many recent plays the music page reads, used by both the stats tile and the list, so the stats describe exactly the plays shown.

Artists are counted by their lead credit, keyed by its id, or `name:<lowercased name>` when there is none: artists that come only from the Spotify history export have no id, and the name is the next best key.

See ADR-0104.
