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
  home?: "primary" | "supporting";
};

export type UsesGroup = { title: string; items: UsesItem[] };

/** Art that sits on the desk wired or paired to the daily driver. */
const PERIPHERAL_ART = new Set(["keyboard", "mouse", "airpods"]);

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

/**
 * Columns (of 12) for each group's plate. The inspector takes 5 beside the
 * first group; the rest pair up narrow then wide, except that a pair of the
 * same size splits the row evenly so their grids match tile for tile. A last
 * group left on its own takes the row.
 */
export function groupSpan(groups: UsesGroup[], index: number): 5 | 6 | 7 | 12 {
  if (index === 0) return 7;
  const odd = index % 2 === 1;
  if (odd && index === groups.length - 1) return 12;
  const partner = groups[odd ? index + 1 : index - 1];
  if (partner && partner.items.length === groups[index]?.items.length) return 6;
  return odd ? 5 : 7;
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

/** The home tile's chips: primary items first, each set in its /uses order. */
export function homeStack(groups: UsesGroup[]): UsesItem[] {
  const items = groups.flatMap((group) => group.items);
  return [
    ...items.filter((item) => item.home === "primary"),
    ...items.filter((item) => item.home === "supporting"),
  ];
}
