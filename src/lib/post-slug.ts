// Dependency-free: the editor bundles this into the page.

/**
 * The filename without `.md`, and so the URL. A leading underscore is a file
 * the glob loader skips. `edit` would be shadowed by the editor's own route.
 */
const SLUG = /^_?[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["edit"]);

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && SLUG.test(value) && !RESERVED.has(value);
}

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}
