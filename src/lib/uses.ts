export type UsesItem = {
  name: string;
  detail?: string;
  url?: string;
  art: string;
  home?: "primary" | "supporting";
};

export type UsesGroup = { title: string; items: UsesItem[] };

const PERIPHERAL_ART = new Set(["keyboard", "mouse", "airpods"]);

export function dailyDriver(groups: UsesGroup[]): UsesItem | undefined {
  return groups[0]?.items[0];
}

export function driverFact(item: UsesItem | undefined): string | undefined {
  const last = item?.detail?.split(",").at(-1)?.trim();
  return last || undefined;
}

export function pluggedIn(groups: UsesGroup[]): UsesItem[] {
  return (groups[0]?.items.slice(1) ?? []).filter((item) =>
    PERIPHERAL_ART.has(item.art),
  );
}

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

export function homeStack(groups: UsesGroup[]): UsesItem[] {
  const items = groups.flatMap((group) => group.items);
  return [
    ...items.filter((item) => item.home === "primary"),
    ...items.filter((item) => item.home === "supporting"),
  ];
}
