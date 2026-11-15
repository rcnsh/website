import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
import { COVER_CLOSE_MS, latticeCover } from "./lattice-wipe.ts";
import { needsFullLoad } from "./server-pages.ts";

// Prerendered pages navigate with Astro's <ClientRouter />, so a module
// script runs once per document while the document shows many pages. Anything
// bound to a page's markup goes through `onPage`. See CLAUDE.md § Maintenance
// › CSP and the router.

/**
 * Runs `setup` for the page on screen now, and again after every soft
 * navigation. The signal aborts when that page is swapped out, so window and
 * document listeners, observers and timers tied to it must take it.
 *
 * Runs at once rather than on `astro:page-load`: the router fires the first
 * one on window `load`, after every image. On SSR pages, which carry no
 * router, neither swap event fires, so this is exactly one call.
 */
export function onPage(setup: (signal: AbortSignal) => void): void {
  let current: AbortController | null = null;
  const run = () => {
    current?.abort();
    current = new AbortController();
    setup(current.signal);
  };
  document.addEventListener("astro:before-swap", () => {
    current?.abort();
    current = null;
  });
  document.addEventListener("astro:after-swap", run);
  run();
}

/**
 * `<html>` attributes that describe the reader, not the page. The router
 * replaces `<html>`'s attributes with the incoming page's, which were rendered
 * without them.
 */
const READER_ATTRIBUTES = ["data-motion", "data-owner"];

export function keepReaderAttributes(): void {
  document.addEventListener("astro:before-swap", (event) => {
    const incoming = (event as TransitionBeforeSwapEvent).newDocument.documentElement;
    for (const name of READER_ATTRIBUTES) {
      const value = document.documentElement.getAttribute(name);
      if (value === null) incoming.removeAttribute(name);
      else incoming.setAttribute(name, value);
    }
  });
}

/** A navigation that never swaps (a failed load) must not leave the cover on. */
const WIPE_STUCK_MS = 4000;

function motionReduced(): boolean {
  const chosen = document.documentElement.dataset.motion;
  return chosen ? chosen === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs the page wipe on every navigation, in place of the router's view
 * transition: the lattice cover (lattice-wipe.ts) closes over the page being
 * left, the swap happens behind it, and it opens on the new page.
 *
 * Not a view transition: that draws the whole document as a snapshot until it
 * ends, so nothing can be hovered and every click lands on `<html>`. The
 * router's transition is given no animation (global.css), which ends it on
 * its first frame, and the cover is `pointer-events: none` over a live page.
 * The swap waits for the cover by wrapping the router's loader.
 */
export function wipePagesIn(): void {
  const cover = latticeCover();
  if (!cover) return;
  let stuck: ReturnType<typeof setTimeout> | undefined;
  let latest: TransitionBeforePreparationEvent | undefined;
  document.addEventListener("astro:before-preparation", (event) => {
    const preparation = event as TransitionBeforePreparationEvent;
    if (event.defaultPrevented || motionReduced()) return;
    // A full load: the cover would close on a page that then just sits there.
    if (!preparation.formData && needsFullLoad(preparation.to.pathname)) return;
    latest = preparation;
    const load = preparation.loader;
    preparation.loader = async () => {
      cover.close();
      clearTimeout(stuck);
      stuck = setTimeout(cover.clear, WIPE_STUCK_MS);
      // Abandoned for an in-page link, which fires neither event here: open
      // again. Abandoned for another page, that one's close takes over.
      preparation.signal.addEventListener("abort", () => {
        if (preparation === latest) cover.open();
      });
      await Promise.all([load(), new Promise((done) => setTimeout(done, COVER_CLOSE_MS))]);
    };
  });
  document.addEventListener("astro:after-swap", () => {
    clearTimeout(stuck);
    latest = undefined;
    if (motionReduced()) cover.clear();
    else cover.open();
  });
}

/**
 * Links into SSR pages and API routes go straight to a full load. Left to
 * itself the router would fetch the page, see it has no <ClientRouter />,
 * throw it away and load it again: two renders, two session lookups.
 *
 * Form posts are left to the router, which posts them and swaps in the page
 * the route redirects to. Refused here, the router would retry one as a GET.
 * A post that must reset the document (signing out) carries data-astro-reload.
 */
export function loadServerPagesDirectly(): void {
  document.addEventListener("astro:before-preparation", (event) => {
    const { formData, to } = event as TransitionBeforePreparationEvent;
    if (!formData && needsFullLoad(to.pathname)) event.preventDefault();
  });
}
