const META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;

export function metaPolicies(html: string): string[] {
  return [...html.matchAll(META)].map((match) => match[1]);
}

export function replaceMetaPolicy(html: string, policy: string): string {
  return html.replace(
    META,
    () => `<meta http-equiv="content-security-policy" content="${policy}">`,
  );
}

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

export function directiveSources(policy: string, directive: string): string[] | null {
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name?.toLowerCase() === directive) return sources;
  }
  return null;
}

const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

export function inlineStyles(html: string): string[] {
  return [...html.matchAll(STYLE)].map((match) => match[1]);
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const EXECUTABLE_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

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
