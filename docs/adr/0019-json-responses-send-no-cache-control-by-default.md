# 0019. JSON responses send no Cache-Control unless given a policy

`json()` in `src/lib/json.ts` takes an optional `policy`, one of the named policies from `shared/cache-policy.ts`; omitting it sends no `cache-control` header at all. That is a safe default, because Cloudflare does not cache a Worker response without `cache-control` either. `privateJson` is the shorthand for `privateNoStore`.
