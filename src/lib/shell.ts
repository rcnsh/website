import { parse } from "shell-quote";

/**
 * A small POSIX-ish shell over a read-only view of the site.
 *
 * Every command here is a real one — `ls`, `cat`, `grep`, `wc` — behaving the
 * way its coreutils namesake does for the flags it accepts, rather than an
 * invented set of verbs. Anything it does not implement says so instead of
 * guessing.
 *
 * Deliberately free of server imports: this runs in the browser, inside the
 * command palette. The filesystem is built by lib/shell-fs.ts and handed over
 * as plain data.
 */

// --- Filesystem ---

export type VFile = {
  type: "file";
  name: string;
  content: string;
  /** Where `xdg-open` sends you, when the file stands for a real page. */
  href?: string;
};

export type VDir = {
  type: "dir";
  name: string;
  children: VNode[];
  href?: string;
};

export type VNode = VFile | VDir;

export const dir = (name: string, children: VNode[], href?: string): VDir => ({
  type: "dir",
  name,
  children,
  href,
});

export const file = (name: string, content: string, href?: string): VFile => ({
  type: "file",
  name,
  content,
  href,
});

/** Byte length, so `ls -l` and `wc -c` agree with each other. */
const sizeOf = (node: VNode): number =>
  node.type === "file"
    ? new TextEncoder().encode(node.content).length
    : node.children.reduce((total, child) => total + sizeOf(child), 0);

/** Splits a path into segments, resolving `.` and `..` against `cwd`. */
export function resolvePath(cwd: string, target: string): string {
  const segments = (target.startsWith("/") ? target : `${cwd}/${target}`).split(
    "/",
  );
  const out: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }

  return `/${out.join("/")}`;
}

export function lookup(root: VDir, path: string): VNode | null {
  let node: VNode = root;

  for (const segment of path.split("/").filter(Boolean)) {
    if (node.type !== "dir") return null;
    const next: VNode | undefined = node.children.find(
      (child) => child.name === segment,
    );
    if (!next) return null;
    node = next;
  }

  return node;
}

// --- Execution ---

export type ShellState = {
  root: VDir;
  cwd: string;
  history: string[];
};

export type RunResult = {
  /** Lines to print. Empty for a command that says nothing, as they should. */
  output: string[];
  /** True when `output` is an error, so the view can colour it. */
  failed: boolean;
  cwd: string;
  /** `clear` empties the scrollback. */
  cleared: boolean;
  /** `xdg-open` hands a URL back for the caller to navigate to. */
  navigate?: string;
};

type Context = {
  state: ShellState;
  cwd: string;
  stdin: string[];
  /** Set by `cd`; the runner threads it through the rest of the pipeline. */
  setCwd: (path: string) => void;
  navigate: (href: string) => void;
  clear: () => void;
};

type Command = {
  /** Shown by `man` and `help`. */
  usage: string;
  summary: string;
  run: (args: string[], ctx: Context) => string[];
};

class ShellError extends Error {}

const fail = (message: string): never => {
  throw new ShellError(message);
};

/** Splits flags from operands, so `-la` and `-l -a` behave alike. */
function parseArgs(args: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const operands: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (arg === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      // -n 5 takes a value; the rest are boolean and may be bundled.
      if (arg === "-n") {
        values.set("n", args[i + 1] ?? "");
        i += 1;
      } else {
        for (const char of arg.slice(1)) flags.add(char);
      }
    } else {
      operands.push(arg);
    }
  }

  return { flags, values, operands };
}

const nodeAt = (ctx: Context, target: string, command: string): VNode => {
  const path = resolvePath(ctx.cwd, target);
  const node = lookup(ctx.state.root, path);
  if (!node) fail(`${command}: ${target}: No such file or directory`);
  return node as VNode;
};

/** stdin when a command is piped into, otherwise the named files. */
function inputLines(
  args: string[],
  ctx: Context,
  command: string,
): string[] {
  const { operands } = parseArgs(args);
  if (operands.length === 0) return ctx.stdin;

  return operands.flatMap((target) => {
    const node = nodeAt(ctx, target, command);
    if (node.type === "dir") fail(`${command}: ${target}: Is a directory`);
    return (node as VFile).content.split("\n");
  });
}

const pad = (text: string, width: number) => text.padStart(width);

export const COMMANDS: Record<string, Command> = {
  ls: {
    usage: "ls [-l] [path...]",
    summary: "list directory contents",
    run: (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const target = operands[0] ?? ".";
      const node = nodeAt(ctx, target, "ls");

      const entries: VNode[] =
        node.type === "dir" ? [...node.children] : [node];
      entries.sort((a, b) => a.name.localeCompare(b.name));

      if (!flags.has("l")) {
        return entries.map((entry) =>
          entry.type === "dir" ? `${entry.name}/` : entry.name,
        );
      }

      const width = Math.max(
        ...entries.map((entry) => String(sizeOf(entry)).length),
        1,
      );

      return entries.map((entry) => {
        const mode = entry.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
        const name = entry.type === "dir" ? `${entry.name}/` : entry.name;
        return `${mode} ${pad(String(sizeOf(entry)), width)} ${name}`;
      });
    },
  },

  sl: {
    usage: "sl [-l] [path...]",
    summary: "list directory contents backwards",
    run: (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const target = operands[0] ?? ".";
      const node = nodeAt(ctx, target, "sl");

      const entries: VNode[] =
        node.type === "dir" ? [...node.children] : [node];

      entries.sort((a, b) => a.name.localeCompare(b.name));

      const reverse = (value: string) => Array.from(value).reverse().join("");

      if (!flags.has("l")) {
        return entries.map((entry) => {
          const name = entry.type === "dir" ? `${entry.name}/` : entry.name;
          return reverse(name);
        });
      }

      const width = Math.max(
        ...entries.map((entry) => String(sizeOf(entry)).length),
        1,
      );

      return entries.map((entry) => {
        const mode = entry.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
        const name = entry.type === "dir" ? `${entry.name}/` : entry.name;

        return reverse(`${mode} ${pad(String(sizeOf(entry)), width)} ${name}`);
      });
    },
  },


  cd: {
    usage: "cd [path]",
    summary: "change the working directory",
    run: (args, ctx) => {
      const { operands } = parseArgs(args);
      const target = operands[0] ?? "/";
      const path = resolvePath(ctx.cwd, target);
      const node = lookup(ctx.state.root, path);

      if (!node) fail(`cd: ${target}: No such file or directory`);
      if (node!.type !== "dir") fail(`cd: ${target}: Not a directory`);

      ctx.setCwd(path);
      return [];
    },
  },

  pwd: {
    usage: "pwd",
    summary: "print the working directory",
    run: (_args, ctx) => [ctx.cwd],
  },

  cat: {
    usage: "cat [file...]",
    summary: "concatenate files to standard output",
    run: (args, ctx) => inputLines(args, ctx, "cat"),
  },

  echo: {
    usage: "echo [text...]",
    summary: "write arguments to standard output",
    run: (args) => [args.join(" ")],
  },

  head: {
    usage: "head [-n count] [file...]",
    summary: "output the first part of a file",
    run: (args, ctx) => {
      const { values } = parseArgs(args);
      const count = Number(values.get("n") ?? 10);
      return inputLines(args, ctx, "head").slice(0, Math.max(count, 0));
    },
  },

  tail: {
    usage: "tail [-n count] [file...]",
    summary: "output the last part of a file",
    run: (args, ctx) => {
      const { values } = parseArgs(args);
      const count = Number(values.get("n") ?? 10);
      const lines = inputLines(args, ctx, "tail");
      return count >= lines.length ? lines : lines.slice(-count);
    },
  },

  wc: {
    usage: "wc [-l] [-w] [-c] [file...]",
    summary: "count lines, words and bytes",
    run: (args, ctx) => {
      const { flags } = parseArgs(args);
      const lines = inputLines(args, ctx, "wc");
      const text = lines.join("\n");

      const counts = {
        l: lines.length,
        w: text.split(/\s+/).filter(Boolean).length,
        c: new TextEncoder().encode(text).length,
      };

      const wanted = (["l", "w", "c"] as const).filter((key) =>
        flags.size === 0 ? true : flags.has(key),
      );

      return [wanted.map((key) => pad(String(counts[key]), 7)).join("")];
    },
  },

  grep: {
    usage: "grep [-i] [-v] [-n] pattern [file...]",
    summary: "search for a pattern",
    run: (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const pattern = operands[0];
      if (pattern === undefined) fail("usage: grep [-ivn] pattern [file...]");

      // Operands after the pattern are files; inputLines re-parses, so drop it.
      const rest = args.filter((arg) => arg !== pattern);
      const lines = inputLines(rest, ctx, "grep");

      let regex: RegExp;
      try {
        regex = new RegExp(pattern as string, flags.has("i") ? "i" : "");
      } catch {
        return fail(`grep: ${pattern}: invalid regular expression`);
      }

      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => regex.test(line) !== flags.has("v"))
        .map(({ line, index }) =>
          flags.has("n") ? `${index + 1}:${line}` : line,
        );
    },
  },

  find: {
    usage: "find [path] [-name pattern]",
    summary: "walk a directory tree",
    run: (args, ctx) => {
      const nameIndex = args.indexOf("-name");
      const pattern = nameIndex === -1 ? null : args[nameIndex + 1];
      const target =
        args.find((arg, i) => !arg.startsWith("-") && i !== nameIndex + 1) ??
        ".";

      const start = resolvePath(ctx.cwd, target);
      const node = nodeAt(ctx, target, "find");

      // Shell globs, not regex: * and ? only.
      const matcher = pattern
        ? new RegExp(
            `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
          )
        : null;

      const out: string[] = [];
      const walk = (current: VNode, path: string) => {
        if (!matcher || matcher.test(current.name)) out.push(path);
        if (current.type === "dir") {
          for (const child of current.children) {
            walk(child, path === "/" ? `/${child.name}` : `${path}/${child.name}`);
          }
        }
      };

      walk(node, start);
      return out;
    },
  },

  tree: {
    usage: "tree [path]",
    summary: "list contents as a tree",
    run: (args, ctx) => {
      const { operands } = parseArgs(args);
      const target = operands[0] ?? ".";
      const node = nodeAt(ctx, target, "tree");

      const out: string[] = [target === "." ? ctx.cwd : target];
      let dirs = 0;
      let files = 0;

      const walk = (current: VNode, prefix: string) => {
        if (current.type !== "dir") return;
        current.children.forEach((child, index) => {
          const last = index === current.children.length - 1;
          out.push(
            `${prefix}${last ? "└── " : "├── "}${child.name}${child.type === "dir" ? "/" : ""}`,
          );
          if (child.type === "dir") {
            dirs += 1;
            walk(child, `${prefix}${last ? "    " : "│   "}`);
          } else {
            files += 1;
          }
        });
      };

      walk(node, "");
      out.push("", `${dirs} directories, ${files} files`);
      return out;
    },
  },

  file: {
    usage: "file [path...]",
    summary: "describe file type",
    run: (args, ctx) => {
      const { operands } = parseArgs(args);
      if (operands.length === 0) fail("usage: file [path...]");

      return operands.map((target) => {
        const node = nodeAt(ctx, target, "file");
        if (node.type === "dir") return `${target}: directory`;
        const text = (node as VFile).content;
        return `${target}: ASCII text${text.endsWith("\n") ? "" : ", with no newline at end of file"}`;
      });
    },
  },

  du: {
    usage: "du [-s] [path]",
    summary: "estimate file space usage",
    run: (args, ctx) => {
      const { flags, operands } = parseArgs(args);
      const target = operands[0] ?? ".";
      const node = nodeAt(ctx, target, "du");

      const out: string[] = [];
      const walk = (current: VNode, path: string) => {
        if (current.type === "dir" && !flags.has("s")) {
          for (const child of current.children) {
            walk(child, path === "/" ? `/${child.name}` : `${path}/${child.name}`);
          }
        }
        out.push(`${pad(String(sizeOf(current)), 7)} ${path}`);
      };

      walk(node, target === "." ? ctx.cwd : target);
      return out;
    },
  },

  df: {
    usage: "df",
    summary: "report filesystem usage",
    run: (_args, ctx) => {
      const used = sizeOf(ctx.state.root);
      return [
        "Filesystem      1K-blocks   Used Available Use% Mounted on",
        `rcn.sh              ${pad(String(Math.ceil(used / 1024) + 64), 6)} ${pad(String(Math.ceil(used / 1024)), 6)} ${pad("64", 9)}  ${pad(String(Math.round((used / (used + 65536)) * 100)), 3)}% /`,
      ];
    },
  },

  whoami: {
    usage: "whoami",
    summary: "print the effective user",
    run: () => ["guest"],
  },

  hostname: {
    usage: "hostname",
    summary: "print the hostname",
    run: () => ["rcn.sh"],
  },

  uname: {
    usage: "uname [-a]",
    summary: "print system information",
    run: (args) => {
      const { flags } = parseArgs(args);
      return flags.has("a")
        ? ["Workers rcn.sh 1.0.0 v8 workerd x86_64 Cloudflare"]
        : ["Workers"];
    },
  },

  date: {
    usage: "date",
    summary: "print the current date and time",
    run: () => [new Date().toString()],
  },

  env: {
    usage: "env",
    summary: "print the environment",
    run: (_args, ctx) => [
      "USER=guest",
      "HOME=/",
      "SHELL=/bin/sh",
      "HOSTNAME=rcn.sh",
      `PWD=${ctx.cwd}`,
    ],
  },

  which: {
    usage: "which name...",
    summary: "locate a command",
    run: (args) => {
      const { operands } = parseArgs(args);
      if (operands.length === 0) fail("usage: which name...");
      return operands.map((name) =>
        name in COMMANDS ? `/bin/${name}` : `which: no ${name} in (/bin)`,
      );
    },
  },

  history: {
    usage: "history",
    summary: "show command history",
    run: (_args, ctx) =>
      ctx.state.history.map(
        (entry, index) => `${pad(String(index + 1), 4)}  ${entry}`,
      ),
  },

  man: {
    usage: "man command",
    summary: "show a command's manual",
    run: (args) => {
      const { operands } = parseArgs(args);
      const name = operands[0];
      if (!name) fail("What manual page do you want?");

      const command = COMMANDS[name as string];
      if (!command) fail(`No manual entry for ${name}`);

      return [
        "NAME",
        `    ${name} — ${command!.summary}`,
        "",
        "SYNOPSIS",
        `    ${command!.usage}`,
      ];
    },
  },

  help: {
    usage: "help",
    summary: "list available commands",
    run: () => {
      const names = Object.keys(COMMANDS).sort();
      const width = Math.max(...names.map((name) => name.length));
      return [
        "Real commands, mostly. `man <name>` for one of them.",
        "",
        ...names.map((name) => `  ${name.padEnd(width)}  ${COMMANDS[name]!.summary}`),
        "",
        "Pipes work: ls /blog | grep astro | wc -l",
      ];
    },
  },

  clear: {
    usage: "clear",
    summary: "clear the screen",
    run: (_args, ctx) => {
      ctx.clear();
      return [];
    },
  },

  "xdg-open": {
    usage: "xdg-open path",
    summary: "open a path in the browser",
    run: (args, ctx) => {
      const { operands } = parseArgs(args);
      const target = operands[0];
      if (!target) fail("usage: xdg-open path");

      const node = nodeAt(ctx, target as string, "xdg-open");
      const href = node.href ?? (node.type === "dir" ? undefined : undefined);
      if (!href) fail(`xdg-open: ${target}: no application to open it with`);

      ctx.navigate(href as string);
      return [`Opening ${href}…`];
    },
  },
};

// --- Completion ---

export type Completion = {
  /** The line with the completion applied; unchanged when there was nothing. */
  line: string;
  /** Where the caret should sit afterwards. */
  cursor: number;
  /** Printed when the completion is ambiguous, the way bash lists matches. */
  candidates: string[];
};

/** Longest string every candidate starts with. */
function commonPrefix(values: string[]): string {
  if (values.length === 0) return "";

  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/**
 * Tab completion, following the shell convention: one match is inserted, many
 * are collapsed to their common prefix, and only when that adds nothing does
 * it print the list.
 *
 * Completes the word under the caret rather than assuming the end of the line,
 * so going back to fix an earlier argument still works. A directory completes
 * with a trailing slash and no space, so the next segment can be typed
 * straight after it.
 */
export function complete(
  state: ShellState,
  line: string,
  cursor: number = line.length,
): Completion {
  const unchanged: Completion = { line, cursor, candidates: [] };

  const before = line.slice(0, cursor);
  const after = line.slice(cursor);

  const wordStart =
    Math.max(
      before.lastIndexOf(" "),
      before.lastIndexOf("\t"),
      before.lastIndexOf("|"),
    ) + 1;

  const word = before.slice(wordStart);

  // A command is expected at the start of the line and after each pipe.
  const isCommand = /(^|\|)\s*$/.test(before.slice(0, wordStart));

  /** The portion of `word` already committed — only the tail gets replaced. */
  let head = "";
  let tails: string[];

  if (isCommand) {
    tails = Object.keys(COMMANDS)
      .filter((name) => name.startsWith(word))
      .sort();
  } else {
    const slash = word.lastIndexOf("/");
    head = slash === -1 ? "" : word.slice(0, slash + 1);
    const prefix = word.slice(head.length);

    const parent = lookup(state.root, resolvePath(state.cwd, head || "."));
    if (parent?.type !== "dir") return unchanged;

    tails = parent.children
      .filter((child) => child.name.startsWith(prefix))
      .map((child) => (child.type === "dir" ? `${child.name}/` : child.name))
      .sort();
  }

  if (tails.length === 0) return unchanged;

  const typed = word.slice(head.length);
  let insert: string;

  if (tails.length === 1) {
    const only = tails[0]!;
    // Directories stay open for the next segment; everything else ends a word.
    insert = only.endsWith("/") ? only : `${only} `;
  } else {
    const shared = commonPrefix(tails);
    // Nothing more to agree on, so show the options instead of doing nothing.
    if (shared.length <= typed.length) {
      return { line, cursor, candidates: tails };
    }
    insert = shared;
  }

  const replacement = head + insert;
  const start = line.slice(0, wordStart);

  return {
    line: start + replacement + after,
    cursor: wordStart + replacement.length,
    candidates: [],
  };
}

/**
 * Tokenises with shell-quote, so quoting and escaping behave, then runs the
 * pipeline left to right. Only `|` is supported — redirects would need a
 * writable filesystem, and this one is a view of a website.
 */
export function run(state: ShellState, line: string): RunResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return { output: [], failed: false, cwd: state.cwd, cleared: false };
  }

  let cwd = state.cwd;
  let cleared = false;
  let navigate: string | undefined;

  const ctxFor = (stdin: string[]): Context => ({
    state,
    cwd,
    stdin,
    setCwd: (path) => {
      cwd = path;
    },
    navigate: (href) => {
      navigate = href;
    },
    clear: () => {
      cleared = true;
    },
  });

  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(trimmed);
  } catch {
    return {
      output: ["sh: syntax error"],
      failed: true,
      cwd,
      cleared: false,
    };
  }

  // Split on `|`; reject every other operator rather than ignoring it.
  const stages: string[][] = [[]];
  for (const token of tokens) {
    if (typeof token === "string") {
      stages[stages.length - 1]!.push(token);
      continue;
    }

    /*
      shell-quote hands back an unquoted glob as an operator with the pattern
      attached, expecting the shell to expand it. There is nothing to expand
      against here, so it goes through as the literal text — which is both what
      bash does when a glob matches nothing, and what `find -name *.md` wants.
    */
    const glob = (token as { pattern?: string }).pattern;
    if (typeof glob === "string") {
      stages[stages.length - 1]!.push(glob);
      continue;
    }

    const op = (token as { op?: string }).op;
    if (op === "|") {
      stages.push([]);
    } else if (op) {
      return {
        output: [`sh: ${op}: not supported`],
        failed: true,
        cwd,
        cleared: false,
      };
    }
  }

  let stdin: string[] = [];

  for (const stage of stages) {
    const [name, ...args] = stage;
    if (!name) {
      return { output: ["sh: syntax error"], failed: true, cwd, cleared: false };
    }

    const command = COMMANDS[name];
    if (!command) {
      return {
        output: [`sh: ${name}: command not found`],
        failed: true,
        cwd,
        cleared: false,
      };
    }

    try {
      stdin = command.run(args, ctxFor(stdin));
    } catch (error) {
      return {
        output: [
          error instanceof ShellError
            ? error.message
            : `sh: ${name}: unexpected failure`,
        ],
        failed: true,
        cwd,
        cleared: false,
      };
    }
  }

  return { output: stdin, failed: false, cwd, cleared, navigate };
}
