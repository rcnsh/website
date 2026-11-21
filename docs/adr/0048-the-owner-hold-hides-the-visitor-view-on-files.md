# 0048. The owner hold hides the visitor view on /files

/files renders the visitors' view from a publicly cached island and swaps in the owner's view after an access probe. Without care, the owner sees the visitors' view flash before their own replaces it. When the owner hint cookie is present, anything showing the visitors' view on /files is hidden until the probe settles, with a 5s timer as the floor. Hidden elements use `visibility` (space kept, `src/components/files/browser.css`), not removal, so the owner's view replaces them in place without layout shift. For the same reason `UsageBar` pads its legend with invisible entries to `max(ownerSlots, visitorSlots)`: the two views may have different numbers of kinds, and padding both to the larger keeps the tile one height.

Once the owner's tree is delivered, the hold lifts after a frame as soon as nothing shows the visitors' view, and otherwise at the timer. Lifting while an island still shows the visitors' view would flash it at the owner; the frame lets the islands' flips commit first.

`holdOwnerViewOnFiles` is registered by `Layout` in every document, not by the /files page. On the first soft navigation into /files the router loads the page's script after the swap, while islands start hydrating as the swap connects them, so a page script would start the hold too late. The hold and the owner-tree hand-off live in `src/components/files/owner-view.ts`, apart from `src/lib/files-source.ts`, so the import every document pays for stays small.

See ADR-0047 and ADR-0049.
