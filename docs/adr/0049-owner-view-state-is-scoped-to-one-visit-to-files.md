# 0049. Owner view state is scoped to one visit to /files

The router keeps one document across pages, so module state in `src/components/files/owner-view.ts` outlives a visit to /files, and the reader may be someone else by the next visit. `forgetOwnerView` drops the owner tree when the reader leaves /files, so a later visit probes again rather than inheriting a tree from a possibly different session. Owner-upgrade callbacks are tied to a visit generation, and a late probe from an earlier visit is ignored, so a probe in flight when the reader left cannot deliver its tree or lift the hold for a later visit.

A page restored from the back-forward cache never re-runs scripts, so it would show the previous reader's view, private folders included; /files reloads on such a restore if the owner hint changed meanwhile. `subscribeOwnerTree` replays the owner tree at once to a subscriber that joins after it arrived, because the usage bar and the browser hydrate in no fixed order.
