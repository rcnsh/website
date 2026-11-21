# 0203. Ledger figures are their own skeleton, and islands own their failure

The home ledger shows figures that arrive in server islands. A fallback that differs in height from the loaded figure shifts the layout when the island lands.

`src/components/home/Figure.astro` with no `value` renders its own skeleton: the figure and, unless it is fixed text, the detail become `placeholder-text` bars inside lines carrying their loaded type classes, so it lands at the same height. With `href` the whole figure is the link, marked by an arrow beside the label, and a pending figure is still a link, so an island that never lands still leaves the way into the page.

The GitHub `Stats` island (`src/components/widgets/Stats.astro`) emits three `Figure` elements with no wrapper, because each must land as a direct child of the figure grid. `getProfile()` throws rather than caching `null`, so stale data survives a failed refresh; the island is therefore where failure is handled: it wraps the call in try/catch, logs `[github] stats island failed`, and shows em dashes.

See ADR-0193.
