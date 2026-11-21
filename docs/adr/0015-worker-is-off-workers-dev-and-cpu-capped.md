# 0015. The Worker is served on rcn.sh only, with a 500ms CPU cap

`wrangler.jsonc` sets `workers_dev: false`. The Worker is served on rcn.sh only, and left unset, every deploy turns the workers.dev URL back on.

`limits.cpu_ms` is 500, a ceiling on what one request can spend, against a route that can be made to loop. The default is 30s and there is no account spend cap behind it. Startup CPU is accounted separately, so cold starts are unaffected.

The `BUCKET` binding uses `remote: true`, so local dev reads the real bucket rather than an empty simulated one. Not all of the bucket is public: upload.rcn.sh (`workers/upload`) serves it and enforces folder visibility.
