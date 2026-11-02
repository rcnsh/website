// Run by the `csp-union` integration in astro.config.ts once Astro has
// written the prerendered pages, whatever command started the build. Rewrites
// every page's meta CSP to the union of all of them, then refuses the build
// if any page holds an inline script or style that policy would block.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  directiveSources,
  inlineScripts,
  inlineStyles,
  metaPolicies,
  replaceMetaPolicy,
  unionPolicies,
} from "../shared/csp-union.ts";

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function sha256(body: string): string {
  return `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
}

/** Returns the policy every page now carries. */
export async function unifyCsp(clientDir: string): Promise<string> {
  const files = await htmlFiles(clientDir);
  if (files.length === 0) throw new Error(`[csp-union] no prerendered pages in ${clientDir}`);

  const pages = await Promise.all(
    files.map(async (file) => ({ file, html: await readFile(file, "utf8") })),
  );

  const policies: string[] = [];
  for (const { file, html } of pages) {
    const found = metaPolicies(html);
    if (found.length !== 1) {
      throw new Error(
        `[csp-union] ${relative(clientDir, file)} has ${found.length} CSP meta tags, expected 1`,
      );
    }
    policies.push(found[0]);
  }
  const policy = unionPolicies(policies);

  const scripts = new Set(directiveSources(policy, "script-src") ?? []);
  const styles = new Set(directiveSources(policy, "style-src") ?? []);
  const blocked: string[] = [];
  for (const { file, html } of pages) {
    const page = relative(clientDir, file);
    for (const body of inlineScripts(html)) {
      if (!scripts.has(sha256(body))) blocked.push(`${page}: <script> ${body.trim().slice(0, 80)}`);
    }
    for (const body of inlineStyles(html)) {
      if (!styles.has(sha256(body))) blocked.push(`${page}: <style> ${body.trim().slice(0, 80)}`);
    }
  }
  if (blocked.length > 0) {
    // A script: an is:inline one missing from shared/inline-scripts.ts. A
    // style: something Astro emits without hashing, like transition:animate.
    throw new Error(`[csp-union] inline code the CSP does not hash:\n  ${blocked.join("\n  ")}`);
  }

  await Promise.all(
    pages.map(({ file, html }) => writeFile(file, replaceMetaPolicy(html, policy))),
  );
  return policy;
}
