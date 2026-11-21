import type { R2Tree } from "@/lib/r2";
import { hasOwnerHint } from "@/lib/owner-hint";
import { onPage } from "@/lib/page-lifecycle";

let ownerTree: R2Tree | null = null;
const listeners = new Set<(tree: R2Tree) => void>();

let visit = 0;

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

export function subscribeOwnerTree(listener: (tree: R2Tree) => void): () => void {
  listeners.add(listener);
  if (ownerTree) listener(ownerTree);
  return () => {
    listeners.delete(listener);
  };
}

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

export function holdOwnerViewOnFiles(): void {
  onPage((signal) => {
    if (!document.querySelector("[data-files-page]")) return;
    const owner = hasOwnerHint();
    startOwnerHold();
    signal.addEventListener("abort", forgetOwnerView);
    addEventListener(
      "pageshow",
      (event) => {
        if (event.persisted && hasOwnerHint() !== owner) location.reload();
      },
      { signal },
    );
  });
}

function forgetOwnerView(): void {
  visit++;
  ownerTree = null;
  releaseOwnerHold();
}

function settleOwnerHold(published: boolean): void {
  if (!published) {
    releaseOwnerHold();
    return;
  }
  requestAnimationFrame(() => {
    if (!document.querySelector('[data-owner-view="visitor"]')) releaseOwnerHold();
  });
}
