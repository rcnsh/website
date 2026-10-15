import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * A post's Markdown source, as the on-site editor reads and writes it. The
 * frontmatter schema lives here so the editor refuses exactly what the build
 * would: a commit that fails it would fail the deploy it triggers.
 */

export const postSchema = z.object({
  title: z.string().min(1),
  /** Used on the index, in <meta name="description">, and in both feeds. */
  description: z.string().min(1),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  /** Visible in `astro dev`, dropped from the production build. */
  draft: z.boolean().default(false),
});

/** Dates as the editor's `<input type="date">` holds them. */
export type PostFields = {
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string | null;
  draft: boolean;
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => toDay(new Date(value)) === value, { error: "not a real date" });

export const postInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(500),
  pubDate: day,
  updatedDate: day.nullable(),
  draft: z.boolean(),
  body: z.string().max(500_000),
});

export type PostInput = z.infer<typeof postInput>;

const toDay = (date: Date) => (Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10));

/**
 * JSON strings are YAML double-quoted scalars, except that YAML reads the two
 * Unicode line separators as line breaks, which JSON leaves raw.
 */
const quote = (value: string) =>
  JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function serialisePost({ body, ...fields }: PostFields & { body: string }): string {
  const lines = [
    `title: ${quote(fields.title)}`,
    `description: ${quote(fields.description)}`,
    `pubDate: ${fields.pubDate}`,
  ];
  if (fields.updatedDate) lines.push(`updatedDate: ${fields.updatedDate}`);
  if (fields.draft) lines.push("draft: true");

  const text = body.replace(/\r\n?/g, "\n").replace(/^\n+/, "");
  return `---\n${lines.join("\n")}\n---\n\n${text.endsWith("\n") || text === "" ? text : `${text}\n`}`;
}

const FRONTMATTER = /^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Throws on a file the build would refuse too. */
export function parsePost(source: string): PostFields & { body: string } {
  const match = FRONTMATTER.exec(source);
  if (!match) throw new Error("No frontmatter");

  const data = postSchema.parse(parseYaml(match[1]) ?? {});
  return {
    title: data.title,
    description: data.description,
    pubDate: toDay(data.pubDate),
    updatedDate: data.updatedDate ? toDay(data.updatedDate) : null,
    draft: data.draft,
    body: source.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}
