/**
 * Derivations for /uses, kept out of the page so they can be tested. The data
 * is site.json's `uses.groups`; the first group is the physical kit, and its
 * first item is the machine everything else hangs off.
 */

export type UsesItem = {
  name: string;
  detail?: string;
  url?: string;
  art: string;
};

export type UsesGroup = { title: string; items: UsesItem[] };

export type ArtKind = "hardware" | "mark" | "drawn";

/** Art that sits on the desk wired or paired to the daily driver. */
const PERIPHERAL_ART = new Set(["keyboard", "mouse", "airpods"]);

export const KIND_NOTE: Record<ArtKind, string> = {
  hardware: "Hardware — drawn by hand on a 96px grid.",
  mark: "Software — shown with its own mark.",
  drawn: "Software — drawn, since it has no mark of its own.",
};

export function artKind(
  groupIndex: number,
  art: string,
  marks: Record<string, unknown>,
): ArtKind {
  if (art in marks) return "mark";
  return groupIndex === 0 ? "hardware" : "drawn";
}

export function dailyDriver(groups: UsesGroup[]): UsesItem | undefined {
  return groups[0]?.items[0];
}

/** The chip, not the chassis: `16", M5 Pro` reads as `M5 Pro` in a fact. */
export function driverFact(item: UsesItem | undefined): string | undefined {
  const last = item?.detail?.split(",").at(-1)?.trim();
  return last || undefined;
}

/** The rest of the physical kit that connects to the daily driver. */
export function pluggedIn(groups: UsesGroup[]): UsesItem[] {
  return (groups[0]?.items.slice(1) ?? []).filter((item) =>
    PERIPHERAL_ART.has(item.art),
  );
}

export function thingCount(groups: UsesGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function position(index: number, of: number): string {
  return `${pad(index + 1)}/${pad(of)}`;
}

export function countLabel(n: number): string {
  return pad(n);
}

export function linkHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}
