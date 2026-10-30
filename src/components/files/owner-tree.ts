import type { R2Tree } from "@/lib/r2";
import { hasOwnerHint } from "@/lib/owner-hint";

// The owner's full tree, handed from the browser to the other islands on the
// page. Either may hydrate first, so a late subscriber is given the tree at once.

let ownerTree: R2Tree | null = null;
const listeners = new Set<(tree: R2Tree) => void>();

export function publishOwnerTree(tree: R2Tree): void {
  ownerTree = tree;
  for (const listener of listeners) listener(tree);
}

export function subscribeOwnerTree(listener: (tree: R2Tree) => void): () => void {
  listeners.add(listener);
  if (ownerTree) listener(ownerTree);
  return () => {
    listeners.delete(listener);
  };
}

// While the owner hint is present, anything still showing the visitors' view
// is kept hidden (browser.css), so the owner's view replaces it in place
// instead of after it. Lifted when the check says otherwise, or on a timer.

const HOLD = "ownerHold";
const HOLD_LIMIT_MS = 5000;

export function startOwnerHold(): void {
  if (!hasOwnerHint()) return;
  document.documentElement.dataset[HOLD] = "";
  setTimeout(releaseOwnerHold, HOLD_LIMIT_MS);
}

export function releaseOwnerHold(): void {
  delete document.documentElement.dataset[HOLD];
}
