import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
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
