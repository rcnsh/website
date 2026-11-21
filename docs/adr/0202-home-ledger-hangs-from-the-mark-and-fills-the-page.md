# 0202. The home ledger hangs from the mark, holds island places and fills the page to the footer

Below the hero, the home page is a ledger of numbered entries, each server island inside its own entry (`src/components/home/LedgerSection.astro`), so a slow island holds its place and nothing reflows into it.

The ledger is drawn to read as part of the brand system. Its first row takes the full-strength rule (`--color-line`, on both entries of a pair from 1280px), and its first entry carries the brand's slanted tab, drawn as a gradient, matching how a tile hangs from the mark's slanted tab. Later rows use the soft rule.

From 1280px (xl), entries marked `data-col` pair into two columns with tighter padding, so the whole ledger fits one screen under the header. In the folded layout `.ledger-link` has a margin of -0.3rem top and bottom: its padding is room for the underline, and keeping it out of the row height leaves the heading level with a neighbouring entry's heading that has no link.

On the home page (`src/pages/index.astro`) `main` is a flex column whose ledger flexes to fill, with no top padding and no footer margin. The ledger's first rule is the hero's foot and the footer closes its last row; slack goes into the last row, so its divider runs down to the footer's rule. From 768px the page shell is at least `200svh` minus the header height. Scrolled to the bottom, the hero's rule meets the header's, as it meets the screen's foot at the top.
