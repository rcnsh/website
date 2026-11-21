# 0033. Visibility rules fail closed and are memoised per isolate

Every bucket read consults the visibility rules, in both the site Worker and upload.rcn.sh. A D1 read per request is wasteful, and a failed or odd read must never widen access.

`rulesLoader` (`shared/visibility.ts`) memoises the rules per isolate for `RULES_FRESH_MS` (10s), which bounds how long a change takes to land everywhere. It throws on a failed read rather than returning `{}`: empty rules would apply the root default to every folder, so a caller that cannot read the rules refuses instead. It exposes `forget`, which the isolate that just wrote a change calls so it sees its own change at once rather than after 10s. A stored value the code does not recognise reads as `private`, so a typo in the table hides a folder and never exposes one.

Both Workers build their loader from `rulesLoader`. The site's is bound in `src/lib/visibility.ts` with drizzle. upload.rcn.sh (`workers/upload/src/handler.ts`) builds its own over raw D1 lazily, once per handler, because the `DB` binding is the same for every request an isolate serves. The memo lives in the `createHandler` closure, not at module level, so tests that create separate handlers do not share a memo.

Caches over visitor answers, such as the files search edge cache, are keyed on `rulesVersion()`, a short fingerprint of the rules, so any rule change yields a new key and nothing cached under the old rules is served under the new ones. The fingerprint is FNV-1a over the sorted rules: it needs to be stable and short, not cryptographic.
