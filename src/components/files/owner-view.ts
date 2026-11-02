import type { R2Tree } from "@/lib/r2";
import { hasOwnerHint } from "@/lib/owner-hint";
import { onPage } from "@/lib/page-lifecycle";

// The browser's side of the owner upgrade (src/lib/files-source.ts): the
// owner's tree handed to the page's other islands, and the hold that keeps
// the visitors' view from showing to the owner. Kept apart from the source
// itself, so Layout, which starts the hold on every document, stays small.

let ownerTree: R2Tree | null = null;
const listeners = new Set<(tree: R2Tree) => void>();

/** Bumped when the reader leaves /files. */
let visit = 0;

/**
 * The owner upgrade's callbacks for the visit on screen now. A probe still in
 * flight when the reader leaves (soft navigation keeps this module) changes
 * nothing when it lands: not the next visit's tree, nor its hold.
 */
export function ownerViewForVisit(): { publish: (tree: R2Tree) => void; onSettled: (published: boolean) => void } {
  const mine = visit;
  return {
    publish: (tree) => {
      if (mine === visit) publishOwnerTree(tree);
    },
    onSettled: (published) => {
      if (mine === visit) settleOwnerHold(published);
    },
  };
}

function publishOwnerTree(tree: R2Tree): void {
  ownerTree = tree;
  for (const listener of listeners) listener(tree);
}

/** Either island may hydrate first, so a late subscriber is given the tree at once. */
export function subscribeOwnerTree(listener: (tree: R2Tree) => void): () => void {
  listeners.add(listener);
  if (ownerTree) listener(ownerTree);
  return () => {
    listeners.delete(listener);
  };
}

// While the owner hint is present, anything still showing the visitors' view
// is kept hidden (browser.css), so the owner's view replaces it in place
// instead of after it. Started by the page before hydration; lifted when the
// access check settles, or on the timer if it never does.

const HOLD = "ownerHold";
const HOLD_LIMIT_MS = 5000;
let holdTimer: ReturnType<typeof setTimeout> | undefined;

function startOwnerHold(): void {
  if (!hasOwnerHint()) return;
  document.documentElement.dataset[HOLD] = "";
  holdTimer = setTimeout(releaseOwnerHold, HOLD_LIMIT_MS);
}

function releaseOwnerHold(): void {
  clearTimeout(holdTimer);
  delete document.documentElement.dataset[HOLD];
}

/**
 * The hold for each /files page, registered by Layout in every document. The
 * page's own script would arrive too late on the first soft navigation into
 * /files: the router loads it after the swap, while the islands start
 * hydrating as the swap connects them.
 */
export function holdOwnerViewOnFiles(): void {
  onPage((signal) => {
    if (!document.querySelector("[data-files-page]")) return;
    const owner = hasOwnerHint();
    startOwnerHold();
    signal.addEventListener("abort", forgetOwnerView);
    // Back to this page from the back-forward cache after signing out (or in):
    // it would still show the last reader's view, private folders included.
    addEventListener(
      "pageshow",
      (event) => {
        if (event.persisted && hasOwnerHint() !== owner) location.reload();
      },
      { signal },
    );
  });
}

/** Leaving /files: a later visit must probe again, not inherit this tree. */
function forgetOwnerView(): void {
  visit++;
  ownerTree = null;
  releaseOwnerHold();
}

/**
 * With the owner's tree out, each island flips to the owner's view as it
 * renders it; one that has not yet (still hydrating) stays held until the
 * timer rather than flash the visitors' view. A frame lets the flips commit.
 */
function settleOwnerHold(published: boolean): void {
  if (!published) {
    releaseOwnerHold();
    return;
  }
  requestAnimationFrame(() => {
    if (!document.querySelector('[data-owner-view="visitor"]')) releaseOwnerHold();
  });
}
