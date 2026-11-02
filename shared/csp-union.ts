/**
 * One CSP for every prerendered page: the union of the per-page `<meta>`
 * policies Astro writes. A meta policy binds the document it was parsed with,
 * and <ClientRouter /> keeps that document while swapping pages into it, so
 * the entry page's policy must already allow every page's inline scripts.
 * See CLAUDE.md § Maintenance › CSP and the router.
 *
 * Pure string work; scripts/csp-union.ts reads and writes the files.
 */

const META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;

/** The page's meta policies, in document order. */
export function metaPolicies(html: string): string[] {
  return [...html.matchAll(META)].map((match) => match[1]);
}

/** Every page's meta policy replaced by `policy`. */
export function replaceMetaPolicy(html: string, policy: string): string {
  return html.replace(
    META,
    () => `<meta http-equiv="content-security-policy" content="${policy}">`,
  );
}

/**
 * Directive by directive, every source any policy names, in first-seen order.
 * Union is right for allow-lists of hashes and hosts. It would be wrong for a
 * directive whose sources narrow each other, but Astro's meta carries only
 * script-src, style-src and their -attr/-elem forms.
 */
export function unionPolicies(policies: readonly string[]): string {
  const directives = new Map<string, Set<string>>();
  for (const policy of policies) {
    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!directives.has(key)) directives.set(key, new Set());
      for (const source of sources) directives.get(key)?.add(source);
    }
  }
  return [...directives]
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

/** Sources a directive lists, or null when the policy lacks it. */
export function directiveSources(policy: string, directive: string): string[] | null {
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name?.toLowerCase() === directive) return sources;
  }
  return null;
}

const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/** The bodies of a page's inline <style> elements, as a browser would hash them. */
export function inlineStyles(html: string): string[] {
  return [...html.matchAll(STYLE)].map((match) => match[1]);
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const EXECUTABLE_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

/**
 * The bodies of a page's inline scripts that a browser would run, exactly as
 * it would hash them. JSON blocks and external scripts are skipped.
 */
export function inlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const [, attributes, body] of html.matchAll(SCRIPT)) {
    if (/\ssrc\s*=/i.test(` ${attributes}`)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase() ?? "";
    if (!EXECUTABLE_TYPES.has(type)) continue;
    bodies.push(body);
  }
  return bodies;
}
