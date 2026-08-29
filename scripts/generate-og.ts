import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderOgImage } from "../src/lib/og.ts";
import { readingTime } from "../src/lib/utils.ts";

/**
 * Draws a share card per post into public/og/blog/.
 *
 * This is a prebuild step rather than an Astro endpoint because @astrojs/
 * cloudflare prerenders inside workerd, where neither sharp's native binding
 * nor reading a font off disk will work. Plain Node has no such trouble, and
 * the cards come out as static files Cloudflare serves without waking a
 * Worker. Runs ahead of both `dev` and `build`; see package.json.
 *
 * Incremental: a card is redrawn only when its post, the card layout, or this
 * script is newer than the PNG already on disk.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "src/content/blog");
const OUT_DIR = path.join(ROOT, "public/og/blog");

/** Touching either of these restyles every card, so both invalidate all of them. */
const LAYOUT_SOURCES = [
  path.join(ROOT, "src/lib/og.ts"),
  fileURLToPath(import.meta.url),
];

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type Post = {
  /** Collection id: the path under src/content/blog without the extension. */
  id: string;
  file: string;
  title: string;
  description: string;
  pubDate: Date;
};

async function mtime(file: string): Promise<number> {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Every .md under src/content/blog.
 *
 * No underscore filter: unlike the pages router, the content glob loader takes
 * `_name.md` as an ordinary entry with id `_name`, so skipping them here would
 * leave a real post without a card. `draft: true` is what hides a file, and
 * readPost() honours it.
 */
async function findPosts(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const id = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await findPosts(path.join(dir, entry.name), id)));
    } else if (entry.name.endsWith(".md")) {
      files.push(id.slice(0, -".md".length));
    }
  }

  return files;
}

async function readPost(id: string): Promise<Post | null> {
  const file = path.join(POSTS_DIR, `${id}.md`);
  const source = await readFile(file, "utf8");

  const match = source.match(FRONTMATTER);
  if (!match) {
    console.warn(`[og] ${id}.md has no frontmatter — skipped`);
    return null;
  }

  const data = parseYaml(match[1]!) as Record<string, unknown>;

  // Drafts are dropped from the production build, so a card would only ever
  // be an orphan in public/.
  if (data.draft === true) return null;

  const { title, description, pubDate } = data;
  if (typeof title !== "string" || typeof description !== "string") {
    console.warn(`[og] ${id}.md is missing title or description — skipped`);
    return null;
  }

  return {
    id,
    file,
    title,
    description,
    // The collection schema coerces this, and YAML already gives a Date for a
    // bare `2026-08-29`; a quoted one arrives as a string.
    pubDate: pubDate instanceof Date ? pubDate : new Date(String(pubDate)),
  };
}

/** Cards left behind by posts that have been renamed, deleted or drafted. */
async function prune(dir: string, keep: Set<string>, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const id = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await prune(full, keep, id);
    } else if (
      entry.name.endsWith(".png") &&
      !keep.has(id.slice(0, -".png".length))
    ) {
      await rm(full);
      console.log(`[og] removed stale ${id}`);
    }
  }
}

async function main() {
  const ids = await findPosts(POSTS_DIR);
  const posts = (await Promise.all(ids.map(readPost))).filter(
    (post): post is Post => post !== null,
  );

  if (posts.length === 0) {
    console.log("[og] no published posts — nothing to draw");
    await prune(OUT_DIR, new Set());
    return;
  }

  const layoutChangedAt = Math.max(
    ...(await Promise.all(LAYOUT_SOURCES.map(mtime))),
  );

  let drawn = 0;

  for (const post of posts) {
    const out = path.join(OUT_DIR, `${post.id}.png`);
    const [sourceAt, outAt] = await Promise.all([mtime(post.file), mtime(out)]);

    if (outAt > sourceAt && outAt > layoutChangedAt) continue;

    const png = await renderOgImage({
      title: post.title,
      description: post.description,
      meta: [
        DATE_FORMAT.format(post.pubDate),
        `${readingTime(await readFile(post.file, "utf8"))} min read`,
      ],
    });

    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(png));
    drawn += 1;
    console.log(`[og] drew ${post.id}.png`);
  }

  await prune(OUT_DIR, new Set(posts.map((post) => post.id)));

  console.log(
    `[og] ${drawn} drawn, ${posts.length - drawn} already current (${posts.length} posts)`,
  );
}

await main();
