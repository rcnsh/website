import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
import { COVER_CLOSE_MS, latticeCover } from "./lattice-wipe.ts";
import { needsFullLoad } from "./server-pages.ts";

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

const WIPE_STUCK_MS = 4000;

function motionReduced(): boolean {
  const chosen = document.documentElement.dataset.motion;
  return chosen ? chosen === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function wipePagesIn(): void {
  const cover = latticeCover();
  if (!cover) return;
  let stuck: ReturnType<typeof setTimeout> | undefined;
  let latest: TransitionBeforePreparationEvent | undefined;
  document.addEventListener("astro:before-preparation", (event) => {
    const preparation = event as TransitionBeforePreparationEvent;
    if (event.defaultPrevented || motionReduced()) return;
    if (!preparation.formData && needsFullLoad(preparation.to.pathname)) return;
    latest = preparation;
    const load = preparation.loader;
    preparation.loader = async () => {
      cover.close();
      clearTimeout(stuck);
      stuck = setTimeout(cover.clear, WIPE_STUCK_MS);
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

function buildOf(doc: Document): string | null {
  return doc.querySelector('meta[http-equiv="content-security-policy" i]')?.getAttribute("content") ?? null;
}

export function reloadAcrossBuilds(): void {
  if (import.meta.env.DEV) return;
  const own = buildOf(document);
  if (own === null) return;
  document.addEventListener("astro:before-preparation", (event) => {
    const preparation = event as TransitionBeforePreparationEvent;
    const load = preparation.loader;
    preparation.loader = async () => {
      await load();
      if (preparation.defaultPrevented || preparation.signal.aborted) return;
      if (buildOf(preparation.newDocument) !== own) preparation.preventDefault();
    };
  });
}

export function loadServerPagesDirectly(): void {
  document.addEventListener("astro:before-preparation", (event) => {
    const { formData, to } = event as TransitionBeforePreparationEvent;
    if (!formData && needsFullLoad(to.pathname)) event.preventDefault();
  });
}
