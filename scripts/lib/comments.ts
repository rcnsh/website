import ts from "typescript";

export interface Comment {
  line: number;
  endLine: number;
  text: string;
  ownLines: number;
}

const DIRECTIVE =
  /^(\/\/\/\s*<reference|-->\s*statement-breakpoint|\/(\/|\*\*?)\s*(@ts-(expect-error|ignore|nocheck|check)|biome-ignore|@jsx|@vite-ignore|glsl\s*\*\/|[#@]__(PURE|NO_SIDE_EFFECTS)__|prettier-ignore|#(region|endregion)))/;

export const isDirective = (text: string) => DIRECTIVE.test(text.trim());

interface Range {
  start: number;
  end: number;
}

interface Syntax {
  line: string[];
  block: boolean;
  quotes: string;
}

function scan(source: string, syntax: Syntax, from = 0, to = source.length): Range[] {
  const out: Range[] = [];
  let quote = "";
  for (let i = from; i < to; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (syntax.quotes.includes(c)) quote = c;
    else if (syntax.block && c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 || end + 2 > to ? to : end + 2;
      out.push({ start: i, end: stop });
      i = stop - 1;
    } else if (syntax.line.some((m) => source.startsWith(m, i))) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 || end > to ? to : end;
      out.push({ start: i, end: stop });
      i = stop - 1;
    }
  }
  return out;
}

const CSS: Syntax = { line: [], block: true, quotes: `"'` };
const SQL: Syntax = { line: ["--"], block: true, quotes: `"'` };
const GLSL: Syntax = { line: ["//"], block: true, quotes: "" };

function glslRanges(source: string, start: number, end: number): Range[] {
  const out: Range[] = [];
  let from = start;
  for (let i = start; i < end; i++) {
    if (source[i] === "$" && source[i + 1] === "{") {
      out.push(...scan(source, GLSL, from, i));
      let depth = 0;
      for (; i < end; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}" && --depth === 0) break;
      }
      from = i + 1;
    }
  }
  out.push(...scan(source, GLSL, from, end));
  return out;
}

function isShader(source: string, node: ts.Node, file: ts.SourceFile): boolean {
  const start = node.getStart(file);
  return (
    /\/\*\s*glsl\s*\*\//.test(source.slice(node.pos, start)) ||
    /\bvoid\s+main\s*\(/.test(source.slice(start, node.end))
  );
}

function tsRanges(source: string, jsx: boolean): Range[] {
  const file = ts.createSourceFile(
    jsx ? "x.tsx" : "x.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const seen = new Map<number, Range>();
  const text: Range[] = [];
  const add = (list: Range[]) => {
    for (const r of list) seen.set(r.start, r);
  };
  const comments = (list: ts.CommentRange[] | undefined) =>
    (list ?? []).map((r) => ({ start: r.pos, end: r.end }));
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      text.push({ start: node.pos, end: node.end });
      return;
    }
    add(comments(ts.getLeadingCommentRanges(source, node.pos)));
    add(comments(ts.getTrailingCommentRanges(source, node.end)));
    if (
      (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      isShader(source, node, file)
    ) {
      add(glslRanges(source, node.getStart(file) + 1, node.end - 1));
    }
    if (node.kind < ts.SyntaxKind.FirstNode && node.kind !== ts.SyntaxKind.SyntaxList) {
      return;
    }
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...seen.values()].filter(
    (r) => !text.some((t) => r.start >= t.start && r.start < t.end),
  );
}

function yamlRanges(source: string): Range[] {
  const out: Range[] = [];
  let offset = 0;
  let blockIndent = -1;
  for (const line of source.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0 && (line.trim() === "" || indent > blockIndent)) {
      offset += line.length + 1;
      continue;
    }
    blockIndent = -1;
    let quote = "";
    let at = -1;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (quote === '"' && c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if ((c === '"' || c === "'") && (i === 0 || /[\s:[{,]/.test(line[i - 1]))) {
        quote = c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        at = i;
        break;
      }
    }
    const code = at === -1 ? line : line.slice(0, at);
    if (/[:-]\s*[|>][-+0-9]*\s*$/.test(code)) blockIndent = indent;
    if (at !== -1) out.push({ start: offset + at, end: offset + line.length });
    offset += line.length + 1;
  }
  return out;
}

function hashLineRanges(source: string): Range[] {
  const out: Range[] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    if (line.trimStart().startsWith("#")) {
      out.push({ start: offset + line.length - line.trimStart().length, end: offset + line.length });
    }
    offset += line.length + 1;
  }
  return out;
}

function shifted(ranges: Range[], by: number): Range[] {
  return ranges.map((r) => ({ start: r.start + by, end: r.end + by }));
}

function expressionRanges(template: string, open: number, close: number): Range[] {
  const body = template.slice(open + 1, close);
  if (!body.includes("//") && !body.includes("/*")) return [];
  const prefix = "x=<>{";
  return shifted(tsRanges(`${prefix}${body}}</>`, true), open + 1 - prefix.length).filter(
    (r) => r.start > open && r.end <= close,
  );
}

function regexEnd(source: string, start: number): number {
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") i++;
    else if (c === "\n") return i;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i;
  }
  return source.length;
}

function closesCleanly(code: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    if (scanner.isUnterminated()) return false;
  }
  return true;
}

function frontmatter(source: string): { body: string; start: number; end: number } | null {
  const open = /^\uFEFF?\s*---[ \t]*\r?\n/.exec(source);
  if (!open) return null;
  const start = open[0].length;
  for (const close of source.slice(start).matchAll(/---[ \t]*(?:\r?\n|$)/g)) {
    const body = source.slice(start, start + close.index);
    if (closesCleanly(body)) return { body, start, end: start + close.index + close[0].length };
  }
  return null;
}

function templateRanges(template: string): Range[] {
  const out: Range[] = [];
  let inTag = false;
  let quote = "";
  let depth = 0;
  let open = -1;
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (quote) {
      if (c === "\\" && depth > 0) i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (depth > 0) {
      if (template.startsWith("//", i) || template.startsWith("/*", i)) {
        const end = template.indexOf(template[i + 1] === "/" ? "\n" : "*/", i + 2);
        i = end === -1 ? template.length : end + (template[i + 1] === "/" ? 0 : 1);
        continue;
      }
      let back = i - 1;
      while (back >= 0 && /\s/.test(template[back])) back--;
      const prev = template[back] ?? "";
      const operand =
        /[=(,:[{?&|!+\-*/%;]/.test(prev) || (prev === ">" && template[back - 1] === "=");
      if ("'\"`".includes(c) && operand) quote = c;
      else if (c === "/" && operand) i = regexEnd(template, i);
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) out.push(...expressionRanges(template, open, i));
      continue;
    }
    if (c === "{") {
      depth = 1;
      open = i;
    } else if (inTag) {
      if (c === '"' || c === "'") quote = c;
      else if (c === ">") inTag = false;
    } else if (template.startsWith("<!--", i)) {
      const end = template.indexOf("-->", i + 4);
      const stop = end === -1 ? template.length : end + 3;
      out.push({ start: i, end: stop });
      i = stop - 1;
    } else if (c === "<" && /[A-Za-z/]/.test(template[i + 1] ?? "")) {
      inTag = true;
    }
  }
  return out;
}

function astroRanges(source: string): Range[] {
  const out: Range[] = [];
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  let template = source;

  const fm = frontmatter(source);
  if (fm) {
    out.push(...shifted(tsRanges(fm.body, false), fm.start));
    template = blank(source.slice(0, fm.end)) + template.slice(fm.end);
  }

  for (const [tag, read] of [
    ["script", (s: string) => tsRanges(s, false)],
    ["style", (s: string) => scan(s, CSS)],
  ] as const) {
    const re = new RegExp(`<${tag}\\b[^>]*?(?<!/)>([\\s\\S]*?)</${tag}>`, "g");
    for (const m of template.matchAll(re)) {
      const start = m.index + m[0].indexOf(">") + 1;
      const opening = m[0].slice(0, start - m.index);
      if (!/type=["']application\/(ld\+)?json["']/.test(opening)) {
        out.push(...shifted(read(m[1]), start));
      }
      template =
        template.slice(0, m.index) + blank(m[0]) + template.slice(m.index + m[0].length);
    }
  }

  out.push(...templateRanges(template));
  return out;
}

export type Kind = "ts" | "tsx" | "astro" | "css" | "yaml" | "sql" | "jsonc" | "hash";

export function kindOf(path: string): Kind | null {
  const name = path.split("/").at(-1) ?? "";
  if (/\.(m?[jt]s|cjs)$/.test(name)) return "ts";
  if (/\.[jt]sx$/.test(name)) return "tsx";
  if (name.endsWith(".astro")) return "astro";
  if (name.endsWith(".css")) return "css";
  if (/\.ya?ml$/.test(name)) return "yaml";
  if (name.endsWith(".sql")) return "sql";
  if (name.endsWith(".jsonc")) return "jsonc";
  if (["_redirects", "_headers", ".gitignore", ".dev.vars.example"].includes(name)) {
    return "hash";
  }
  return null;
}

function rangesFor(source: string, kind: Kind): Range[] {
  switch (kind) {
    case "ts":
    case "jsonc":
      return tsRanges(source, false);
    case "tsx":
      return tsRanges(source, true);
    case "astro":
      return astroRanges(source);
    case "css":
      return scan(source, CSS);
    case "sql":
      return scan(source, SQL);
    case "yaml":
      return yamlRanges(source);
    case "hash":
      return hashLineRanges(source);
  }
}

export function findComments(source: string, kind: Kind): Comment[] {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  const lineAt = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lineText = (n: number) =>
    source.slice(lineStarts[n], (lineStarts[n + 1] ?? source.length + 1) - 1);

  const sorted = rangesFor(source, kind).sort((a, b) => a.start - b.start);
  const covered = new Map<number, Range[]>();
  for (const r of sorted) {
    for (let n = lineAt(r.start); n <= lineAt(Math.max(r.start, r.end - 1)); n++) {
      covered.set(n, [...(covered.get(n) ?? []), r]);
    }
  }
  const onlyComment = (n: number) => {
    let rest = lineText(n);
    const start = lineStarts[n];
    for (const r of [...(covered.get(n) ?? [])].reverse()) {
      const a = Math.max(0, r.start - start);
      const b = Math.min(rest.length, r.end - start);
      rest = rest.slice(0, a) + rest.slice(b);
    }
    const left = rest.replace(/\s/g, "");
    return left === "" || left === "{}";
  };

  return sorted
    .map((r) => {
      const line = lineAt(r.start);
      const endLine = lineAt(Math.max(r.start, r.end - 1));
      let ownLines = 0;
      for (let n = line; n <= endLine; n++) {
        if (onlyComment(n) && covered.get(n)?.[0] === r) ownLines++;
      }
      return {
        line: line + 1,
        endLine: endLine + 1,
        text: source.slice(r.start, r.end),
        ownLines,
      };
    })
    .filter((c) => !isDirective(c.text));
}
