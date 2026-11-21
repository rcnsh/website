# 0092. Guestbook skeletons are sized to the likely answer

Every live tile on `/guestbook` has a fallback shaped like its loaded markup, so nothing jumps when the answer lands.

While the signer is unknown, `GuestbookSign.tsx` renders the signed-out prompt with its text transparent as the placeholder. Signed out is the commoner answer, and the same markup wraps the same at every width, so the tile keeps its height. The map island's fallback in `src/pages/guestbook.astro` reserves the map's 820x400 aspect (`aspect-[820/400]`) plus the caption line.

The `GuestbookCountries` fallback draws two rows. The guestbook is signed from a country or two, and two rows fill one grid row on a phone, which is where the tile stands alone; beside the map it stretches anyway. The `GuestbookEntries` fallback draws twelve cards with one-line messages. One line is the commoner length. The first page holds up to 25 (`PAGE_SIZE`) and the count cannot be known at prerender; twelve is near the current count and fills whole rows at two and three columns. It is the last tile, so a mismatch moves only the footer.

See ADR-0193.
