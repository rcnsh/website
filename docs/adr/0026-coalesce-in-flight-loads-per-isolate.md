# 0026. In-flight loads are coalesced per isolate

The isolate is where a thundering herd forms: many requests for the same key arriving while one load is in flight. `coalesce(key, loader)` in `src/lib/coalesce.ts` joins an in-progress run for the same key and drops the entry when the run settles, on rejection as well as resolution (`finally`). A retained rejected promise would replay one upstream failure to every later caller for the isolate's lifetime, a failure that outlives its cause; `src/lib/coalesce.test.ts` covers the rejection path.

`coalesce` lives in its own module, free of `cloudflare:workers`, because `cache.ts` imports `cloudflare:workers`, which does not load under `node --test`.
