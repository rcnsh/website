import { z } from "zod";
import raw from "@/content/site.json";

/**
 * Loads and validates `src/content/site.json`. Vite inlines the JSON at build
 * time, and validation runs at module load, so a typo fails the build with the
 * exact path rather than rendering a broken page.
 */

const linkSchema = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
  /** Maps to an icon in components/icons.ts. */
  icon: z.string().optional(),
  /** Extra terms the command palette should match on. */
  keywords: z.string().optional(),
});

const pageSchema = z.object({
  title: z.string().min(1),
  /** Not rendered on the page — this is the <meta name="description">. */
  description: z.string().min(1),
});

const schema = z.object({
  identity: z.object({
    siteName: z.string().min(1),
    url: z.url(),
    author: z.string().min(1),
    tagline: z.string(),
    metaDescription: z.string().min(1),
  }),
  accounts: z.object({
    github: z.string().min(1),
    spotify: z.string().min(1),
  }),
  clock: z.object({
    label: z.string().min(1),
    /** My timezone, not the visitor's. Checked against the runtime's zone database. */
    timeZone: z.string().refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { error: "not a recognised IANA time zone (e.g. \"Europe/London\")" },
    ),
    hour12: z.boolean().default(false),
  }),
  home: z.object({
    bio: z.string().min(1),
  }),
  pages: z.object({
    blog: pageSchema.extend({
      /** The page description is written for search — a subscriber needs its own line. */
      feedDescription: z.string().min(1),
    }),
    uses: pageSchema,
    music: pageSchema,
    guestbook: pageSchema.extend({
      maxMessageLength: z.number().int().positive().default(200),
    }),
    files: pageSchema,
    notFound: pageSchema,
  }),
  uses: z.object({
    groups: z
      .array(
        z.object({
          /** Sits on the group's top border, cutting through it. */
          title: z.string().min(1),
          items: z
            .array(
              z.object({
                name: z.string().min(1),
                url: z.url().optional(),
                /** Second line — a model, a maker, a qualifier. */
                detail: z.string().optional(),
                /**
                 * Which drawing to show. Hardware names a hand-drawn shape in
                 * UsesArt.astro; software will name a brand mark. An unknown
                 * name renders a placeholder rather than nothing, so a typo is
                 * visible on the page instead of silently blank.
                 */
                art: z.string().min(1),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
  nav: z.array(linkSchema).min(1),
  links: z.array(linkSchema),
  stack: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.url(),
        /** Highlighted — the things actually reached for first. */
        primary: z.boolean().optional(),
      }),
    )
    .min(1),
  pinnedRepos: z.array(z.string()),
});

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid src/content/site.json:\n${issues}`);
}

const config = parsed.data;

export const site = {
  name: config.identity.siteName,
  url: config.identity.url,
  author: config.identity.author,
  tagline: config.identity.tagline,
  description: config.identity.metaDescription,
  githubUser: config.accounts.github,
  spotifyUser: config.accounts.spotify,
} as const;

/**
 * A page's own share card, drawn into public/ by scripts/generate-og.ts.
 *
 * Home is not among them — it keeps the static /og.png, which is the card for
 * the site rather than for a page.
 */
export const pageOgHref = (key: keyof typeof config.pages) =>
  `/og/pages/${key}.png`;

export const clock = config.clock;
export const home = config.home;
export const pages = config.pages;
export const nav = config.nav;
export const externalLinks = config.links;
export const stack = config.stack;
export const uses = config.uses;
export const pinnedRepos = config.pinnedRepos;

export type SiteLink = z.infer<typeof linkSchema>;
