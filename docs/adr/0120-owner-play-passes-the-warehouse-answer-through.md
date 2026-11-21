# 0120. Owner play passes the warehouse's answer through unretried

Starting a track is a one-shot action: a retry that lands seconds later is not useful, and only the page knows how to tell the owner it failed.

`warehouse.play()` (`src/lib/warehouse-client.ts`) posts to the warehouse's `/control/play` and returns its `Response`, rejecting only when the warehouse is unconfigured or unreachable. `/api/music/play` (`src/pages/api/music/play.ts`) passes the warehouse's status and JSON body straight through; it answers 503 itself when playback is not configured (`WarehouseNotConfigured`) and 502 when the warehouse is unreachable. In `PlayOnSpotify` any answer but 2xx marks the button `data-state="failed"` with the error as its title for 4 seconds; a success marks it `played` for 1.5 seconds and dispatches `music:played`.
