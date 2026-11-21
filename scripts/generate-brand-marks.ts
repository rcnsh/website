import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as icons from "simple-icons";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/lib/brand-marks.ts");

const WANTED: Record<string, string> = {
  typescript: "typescript",
  python: "python",
  astro: "astro",
  nextjs: "nextdotjs",
  react: "react",
  tailwind: "tailwindcss",
  rust: "rust",
  threejs: "threedotjs",
  mcp: "modelcontextprotocol",
  cloudflare: "cloudflare",
  vercel: "vercel",
  macos: "apple",
  linux: "linux",
  claude: "claude",
  obsidian: "obsidian",
  bitwarden: "bitwarden",
  mullvad: "mullvad",
  tailscale: "tailscale",
};

type Icon = { title: string; slug: string; path: string };

const bySlug = new Map<string, Icon>(
  Object.values(icons as Record<string, unknown>)
    .filter((value): value is Icon =>
      Boolean(
        value &&
          typeof value === "object" &&
          "slug" in value &&
          "path" in value &&
          "title" in value,
      ),
    )
    .map((icon) => [icon.slug, icon]),
);

async function main() {
  const entries: string[] = [];
  const missing: string[] = [];

  for (const [name, slug] of Object.entries(WANTED)) {
    const icon = bySlug.get(slug);
    if (!icon) {
      missing.push(`${name} (${slug})`);
      continue;
    }

    entries.push(
      `  ${name}: { title: ${JSON.stringify(icon.title)}, path: ${JSON.stringify(icon.path)} },`,
    );
  }

  if (missing.length > 0) {
    console.warn(`[marks] no simple-icons entry for: ${missing.join(", ")}`);
  }

  const source = `export type BrandMark = {
  title: string;
  path: string;
};

export const BRAND_MARKS: Record<string, BrandMark> = {
${entries.join("\n")}
};
`;

  await writeFile(OUT, source);
  console.log(
    `[marks] ${entries.length} marks written to src/lib/brand-marks.ts`,
  );
}

await main();
