import type { R2Tree } from "@/lib/r2";

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
