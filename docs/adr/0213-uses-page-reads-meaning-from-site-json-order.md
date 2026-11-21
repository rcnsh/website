# 0213. /uses derives its facts from the order of site.json's groups, and the home Stack tile from /uses

`src/lib/uses.ts` derives facts from `uses.groups` in `site.json` by position: the first group is the physical kit, and its first item is the machine everything else hangs off (`dailyDriver`, `pluggedIn`). The logic is kept out of the page so it can be tested, and the convention means `site.json` order matters.

A uses item's `home` puts it on the home Stack tile (`src/components/widgets/Stack.astro`), which is built from `uses.groups` through `homeStack()`, so the two lists cannot drift. `primary` items lead, carry the dot, are `text-ink`, and need a `url`; `supporting` items follow in `text-ink-dim`. Full ink marks the day-to-day set against the supporting cast. The `·` separator is rendered after each item inside its `<li>`, so a wrapped line never opens on a separator.

A uses item's `art` names a hand-drawn shape in `src/components/uses/UsesArt.astro` or a brand mark. The schema accepts any non-empty string, and an unknown name renders a placeholder, so a missing drawing degrades visibly rather than failing the build.
