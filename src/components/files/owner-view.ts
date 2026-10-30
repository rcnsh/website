import type { R2Tree } from "@/lib/r2";
import { hasOwnerHint } from "@/lib/owner-hint";

// The browser's side of the owner upgrade (src/lib/files-source.ts): the
// owner's tree handed to the page's other islands, and the hold that keeps
// the visitors' view from showing to the owner. Kept apart from the source
// itself, so the page script that starts the hold stays small.

let ownerTree: R2Tree | null = null;
const listeners = new Set<(tree: R2Tree) => void>();

export function publishOwnerTree(tree: R2Tree): void {
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

export function startOwnerHold(): void {
  if (!hasOwnerHint()) return;
  document.documentElement.dataset[HOLD] = "";
  holdTimer = setTimeout(releaseOwnerHold, HOLD_LIMIT_MS);
}

function releaseOwnerHold(): void {
  clearTimeout(holdTimer);
  delete document.documentElement.dataset[HOLD];
}

/**
 * With the owner's tree out, each island flips to the owner's view as it
 * renders it; one that has not yet (still hydrating) stays held until the
 * timer rather than flash the visitors' view. A frame lets the flips commit.
 */
export function settleOwnerHold(published: boolean): void {
  if (!published) {
    releaseOwnerHold();
    return;
  }
  requestAnimationFrame(() => {
    if (!document.querySelector('[data-owner-view="visitor"]')) releaseOwnerHold();
  });
}
