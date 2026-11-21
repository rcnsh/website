import { parse as parseAstro } from "@astrojs/compiler/sync";
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

interface AstroNode {
  type: string;
  name?: string;
  value?: string;
  kind?: string;
  raw?: string;
  attributes?: AstroNode[];
  children?: AstroNode[];
}

function astroRanges(source: string): Range[] {
  const out: Range[] = [];
  let cursor = 0;
  const locate = (value: string) => {
    if (!value) return -1;
    const at = source.indexOf(value, cursor);
    if (at !== -1) cursor = at + value.length;
    else if (/\/\/|\/\*|<!--/.test(value)) {
      throw new Error(`cannot place parsed Astro text in the source: ${value.slice(0, 60)}`);
    }
    return at;
  };
  const code = (value: string, jsx: boolean) => {
    const at = locate(value);
    if (at !== -1) out.push(...shifted(tsRanges(value, jsx), at));
  };
  const expression = (node: AstroNode) => {
    let joined = "";
    const map: { from: number; to: number; at: number }[] = [];
    for (const child of node.children ?? []) {
      if (child.type === "text" && child.value) {
        const at = locate(child.value);
        if (at !== -1) map.push({ from: joined.length, to: joined.length + child.value.length, at });
        joined += child.value;
      } else {
        visit(child);
        joined += " null ";
      }
    }
    for (const r of tsRanges(joined, true)) {
      const piece = map.find((m) => r.start >= m.from && r.end <= m.to);
      if (piece) out.push({ start: piece.at + r.start - piece.from, end: piece.at + r.end - piece.from });
    }
  };
  const visit = (node: AstroNode) => {
    if (node.type === "frontmatter") return code(node.value ?? "", false);
    if (node.type === "comment") {
      const at = locate(`<!--${node.value}`);
      if (at === -1) return;
      const end = cursor + (source.startsWith("-->", cursor) ? 3 : 0);
      cursor = end;
      out.push({ start: at, end });
      return;
    }
    if (node.type === "expression") return expression(node);
    if (node.type === "text") {
      const value = node.value ?? "";
      const at = locate(value);
      const open = value.indexOf("<!--");
      if (at !== -1 && open !== -1) out.push({ start: at + open, end: at + value.length });
      return;
    }
    for (const attr of node.attributes ?? []) {
      if (attr.kind === "expression" && attr.value) code(attr.value, true);
      if ((attr.kind === "spread" || attr.kind === "shorthand") && attr.name) code(attr.name, true);
      if (attr.kind === "template-literal" && attr.raw) code(attr.raw, true);
    }
    const raw = node.type === "element" && (node.name === "script" || node.name === "style");
    const json = node.attributes?.some(
      (attr) => attr.name === "type" && /^application\/(ld\+)?json$/.test(attr.value ?? ""),
    );
    for (const child of node.children ?? []) {
      if (raw && child.type === "text" && child.value) {
        if (json) locate(child.value);
        else if (node.name === "style") {
          const at = locate(child.value);
          if (at !== -1) out.push(...shifted(scan(child.value, CSS), at));
        } else code(child.value, false);
      } else visit(child);
    }
  };
  visit(parseAstro(source, { position: false }).ast as AstroNode);
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
