# 0100. The site reaches Spotify only through the music-warehouse, with split read and control tokens

The music-warehouse holds the only Spotify grant; Spotify's own credentials live there, not in the site. The site carries no Spotify credential: it reads from the warehouse server-side, and the browser talks only to `/api/spotify/*` and `/api/music/play`, so the warehouse tokens never reach client JavaScript (`src/lib/spotify.ts`).

`MUSIC_WAREHOUSE_TOKEN` reaches only the warehouse's `/api/*` read routes; it cannot poll or write, since the site only reads. `MUSIC_WAREHOUSE_CONTROL_TOKEN` is the warehouse's `CONTROL_TOKEN`: it can start playback and nothing else, and is used only by the owner-gated `/api/music/play`. Keeping the two apart means a leak of either grants only its one ability.

`src/lib/warehouse-client.ts` is the only transport to the warehouse. `read` sends `MUSIC_WAREHOUSE_TOKEN` and `play` sends `MUSIC_WAREHOUSE_CONTROL_TOKEN`, never the other way round: the control token can only start playback, and the read token must never gain control. The client takes its `fetch` and environment as arguments so it tests under node. `src/lib/warehouse.ts` binds it to the Worker, passing the Worker's `fetch` as an arrow wrapper, because Workers' `fetch` throws "Illegal invocation" when called as a method of another object.
