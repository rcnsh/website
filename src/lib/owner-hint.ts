/**
 * Prerendered pages cannot know who is reading, and asking the Worker on every
 * view would bill every visitor for the owner's convenience. So /blog/edit
 * leaves this flag behind for the owner, and static pages reveal their edit
 * links from it. Forging it only shows a link to a page that refuses you.
 */
const KEY = "rcnsh:owner";

export function setOwnerHint(owner: boolean): void {
  try {
    if (owner) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage disabled; the links stay hidden.
  }
}

export function revealOwnerLinks(): void {
  let owner = false;
  try {
    owner = localStorage.getItem(KEY) === "1";
  } catch {
    return;
  }
  if (!owner) return;
  for (const link of document.querySelectorAll<HTMLElement>("[data-owner-only]")) {
    link.hidden = false;
  }
}
