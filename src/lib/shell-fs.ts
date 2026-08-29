import { dir, file, type VDir, type VNode } from "./shell";
import { formatDate, getPosts, postHref } from "./blog";
import { externalLinks, home, nav, site, stack, uses } from "./site";

/**
 * Builds the filesystem the command palette's shell walks.
 *
 * Server-only: it reads the validated config and the content collection,
 * neither of which resolves in the browser. The tree reaches the client as
 * /shell-fs.json — a prerendered file the palette fetches the first time
 * someone opens the shell. See src/pages/shell-fs.json.ts.
 *
 * Everything is derived from what the site already says about itself, so there
 * is no second copy of the bio here to drift out of date.
 *
 * To add an entry, put a file() or dir() in the array buildFs returns. Every
 * command walks the tree, so nothing needs registering anywhere else.
 */

/** Strips the `[label](url)` config authors write, leaving the label. */
const plain = (text: string) =>
  text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1");

function wrap(text: string, width = 72): string {
  const words = plain(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);

  return lines.join("\n");
}

export async function buildFs(): Promise<VDir> {
  const posts = await getPosts();

  const postFiles: VNode[] = posts.map((post) =>
    file(
      `${post.id}.md`,
      [
        "---",
        `title: ${post.data.title}`,
        `date: ${formatDate(post.data.pubDate)}`,
        "---",
        "",
        wrap(post.data.description),
        "",
        `Read it: ${postHref(post)}`,
      ].join("\n"),
      postHref(post),
    ),
  );

  const usesText = uses.groups
    .map((group) =>
      [
        group.title,
        ...group.items.map(
          (item) => `  ${item.name}${item.detail ? ` — ${plain(item.detail)}` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");

  return dir("", [
    file(
      "README",
      [
        `${site.author} — ${site.name}`,
        site.tagline,
        "",
        wrap(home.bio),
        "",
        "This is a read-only view of the site. `help` lists what works,",
        "`xdg-open <path>` opens the real page.",
      ].join("\n"),
      "/",
    ),

    dir("blog", postFiles, "/blog"),

    file("uses.txt", usesText, "/uses"),

    file(
      "stack.txt",
      stack.map((item) => `${item.name}\t${item.url}`).join("\n"),
      "/uses",
    ),

    file(
      "links.txt",
      externalLinks.map((link) => `${link.label}\t${link.href}`).join("\n"),
    ),

    // Every page the site has, so `ls /pages` and the nav agree by construction.
    dir(
      "pages",
      nav.map((entry) =>
        file(
          `${entry.href === "/" ? "home" : entry.href.replace(/^\//, "")}.url`,
          `${entry.label}\n${entry.href}`,
          entry.href,
        ),
      ),
    ),
  ]);
}
