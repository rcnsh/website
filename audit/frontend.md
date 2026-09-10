# Frontend layout & spacing audit

Scope: visual layout and spacing only, at 375×812 / 768×1024 / 1280×900 / 1920×1080.
Measured against `astro dev` on `localhost:4321`. Security headers, D1, cold start and
error handling are out of scope — see `audit/security.md`, `audit/d1.md`,
`audit/reliability.md`, `audit/performance.md`.

## Summary

**Status: all 13 findings resolved** (2 × P1, 7 × P2, 4 × P3). No P0 — no content was unreachable at any tested width.

Twelve were fixed and one was already moot. Each was deleted from this file as it was settled; what remains is the record of what changed, plus the container geometry, which is unchanged and worth keeping.

**Still true after the changes, re-measured:** zero horizontal overflow on every route × width, and partial rows on `/uses` now split their spare space evenly rather than dumping it on the right.

---

## What changed

| Was | Fix |
|---|---|
| **P1** — after an anchor jump at 375, the target heading was entirely behind the sticky header: `scroll-margin-top: 5rem` (80px) against a 102px header, leaving 4px of a 26px heading visible. | The offset derives from `--header-h` instead of a hard-coded value, and `TopBar` publishes the *measured* header height so it cannot drift from the markup. Verified at 375: header 102px, `scroll-margin-top` 126px, **+24px clearance**. |
| **P1** — the ⌘K trigger was a 14×14px target at 375: the label is `hidden sm:inline` and the button had no padding, unlike the cog 8px away with 2.1× the area. | `-m-2 p-2`, the cog's own pattern — the negative margin cancels the padding, so nothing moves and the target becomes 30×30. |
| **P2** — the contribution graph is a fixed 715px in a scroller with the scrollbar suppressed: 47% hidden at 375 with no affordance, and 4px clipped at exactly 768 where `scrollbar-gutter: stable` takes `clientWidth` to 759. | A fade on whichever edge is cutting content off, and scrolled to the newest week on mount — which also moves the 768 clip onto the *oldest* column, where nobody is looking. Verified at 768: `scrollLeft: 4`, at-newest, fade on the left. |
| **P2** — music explorer view/range switches were 19px tall next to 60px track rows. | `pb-0.5` sets the gap to the underline, so it cannot absorb padding without moving the border. A pseudo-element extends the clickable box instead. Hit-tested: **visual height still 19px, effective target 38px.** |
| **P2** — file-tree rows were 28px and the copy button 20×20. | Rows `py-2 sm:py-1` (34–36px at touch widths, desktop untouched) and the copy button `-m-2 p-2`. The only *visible* change in this group, and unavoidably so: stacked full-width rows cannot use negative margins without adjacent rows overlapping and stealing each other's clicks. |
| **P2** — the guestbook's one primary CTA was 23px. | `-my-2.5 py-2.5` — 43px of target, pixel-identical rendering. |
| **P2** — five vertical rhythms across six pages; the 8px-vs-20px heading gap was visible *within* the home page. | One value per role: page-header `pb-10`, section stack `gap-14`, section heading `mb-5`. `/guestbook` now uses the same stack wrapper as everything else instead of per-section `pt-10` — its section gaps measure a consistent 56px. `PostList`'s tighter `mb-2` is left as a deliberate exception, since the list's own `py-5` already supplies the air. |
| **P2** — the `/uses` grid dumped its spare space on the right: 113px on a five-item group, 226px on a four-item group (a third of the row), and an orphaned tile hugging the left edge at 375. | Flex-wrap with `justify-center` and a basis reproducing the old column widths. Measured after: **58/58 and 114/114** at 1280 and 1920, **77/77** for the orphan at 375. The source comment claiming these counts divide into full rows at every width was wrong and has been corrected. |
| **P2** — a two-line item name pushed its detail line 15px out of the row's baseline at ≥768. | `min-h-[2lh]` reserves the second line, so captions in a row start at the same y. |
| **P3** — the `/uses` group label sat 10px right of its own content edge, and the offset changed at the breakpoint because the inset tracked neither the section padding nor the label's own. | The inset subtracts the label's `px-2.5` and tracks the section padding at both breakpoints. Measured: label text lands exactly on the content edge (0px) on all four sections. |
| **P3** — the settings cog was 30×30. | `-m-2.5 p-2.5` → 34×34, nothing moves. |
| **P3** — `/404` left ~780px of void below the content on a desktop window. | Centred in the height the layout already reserves, guarded at `sm` so short viewports are untouched. 1280×900 now reads 283px above / 206px below, from 54/780. |
| **P3** — two errors logged per soft navigation. | Moot: `<ClientRouter />` was removed with the CSP work, so there are no soft navigations. |

**Also fixed, not in the original findings:** the home page had no active nav marker in the *built* site. `path` derives from `Astro.url.pathname`, which is `/index.html` under `build.format: "file"`, so `isActive("/")` was always false and the underline never appeared on `/`. Invisible in `astro dev` — where the pathname is already `/` — which is why this audit, run against the dev server, could not have caught it.

### On verifying this

The browser harness reports `document.hidden === true` even with the tab fronted, so scroll events never dispatch and the fade's scroll-driven behaviour cannot be exercised end to end. The decision was extracted into `src/lib/edge-fade.ts` and unit-tested instead — worth doing regardless, since the first implementation faded the *right* edge while the graph was scrolled to the right end, drawing a gradient over nothing and leaving the genuinely hidden content unmarked.

---

Container geometry, for reference (measured, not derived):

| Viewport | `clientWidth` | `main` box | padding | content column | header height |
| --- | --- | --- | --- | --- | --- |
| 375 | 375 | 375 | 20/20 | 335 | **102** |
| 768 | 759 | 759 | 24/24 | 711 | 57 |
| 1280 | 1271 | 768 | 24/24 | 720 | 57 |
| 1920 | 1911 | 768 | 24/24 | 720 | 57 |

`clientWidth` is 9px under the viewport at ≥768 because of `scrollbar-gutter: stable`
(`src/styles/global.css:80`). That 9px is what made the contribution graph clip 4px at exactly 768.

---

