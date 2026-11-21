# 0003. Page setup goes through onPage

Under `<ClientRouter />` a module script runs once per document, while the document shows many pages. Setup bound to one page's markup would otherwise run once and never again, and its listeners would outlive the page.

Anything bound to a page's markup is set up through `onPage(setup)` in `src/lib/page-lifecycle.ts`. It runs at once, again after every swap (`astro:after-swap`), and aborts its signal on `astro:before-swap`, so window and document listeners, observers and timers take that signal. It is not `astro:page-load`, whose first firing waits for window `load`, after every image. On SSR pages no swap event fires, so setup runs exactly once.

The router replaces `<html>`'s attributes with the incoming page's, which were rendered without the reader's. `keepReaderAttributes` carries the attributes in `READER_ATTRIBUTES` (`data-motion`, `data-owner`) across each swap; a new attribute about the reader goes in that list.
