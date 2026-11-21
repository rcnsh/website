export function wordCount(body = ""): number {
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  return prose.split(/\s+/).filter(Boolean).length;
}

export type CadenceMonth = {
  year: number;
  month: number;
  published: number;
  drafts: number;
};

export function cadence(
  posts: readonly { date: Date; draft?: boolean }[],
  now: Date,
  maxMonths = 24,
): CadenceMonth[] {
  if (posts.length === 0) return [];

  const index = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const end = Math.max(index(now), ...posts.map((p) => index(p.date)));
  const start = Math.max(Math.min(...posts.map((p) => index(p.date))), end - maxMonths + 1);

  const months: CadenceMonth[] = [];
  for (let i = start; i <= end; i++) {
    months.push({ year: Math.floor(i / 12), month: i % 12, published: 0, drafts: 0 });
  }

  for (const post of posts) {
    const month = months[index(post.date) - start];
    if (!month) continue;
    if (post.draft) month.drafts++;
    else month.published++;
  }

  return months;
}
