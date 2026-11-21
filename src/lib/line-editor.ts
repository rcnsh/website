import { cellWidth } from "./cell-width.ts";

export type Key =
  | { type: "text"; text: string }
  | {
      type:
        | "enter"
        | "backspace"
        | "delete"
        | "left"
        | "right"
        | "word-left"
        | "word-right"
        | "home"
        | "end"
        | "up"
        | "down"
        | "tab"
        | "interrupt"
        | "eof"
        | "clear"
        | "kill-start"
        | "kill-word"
        | "escape";
    };

const CSI: Record<string, Key["type"]> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  "1~": "home",
  "7~": "home",
  "4~": "end",
  "8~": "end",
  "3~": "delete",
  "1;5C": "word-right",
  "1;5D": "word-left",
  "1;3C": "word-right",
  "1;3D": "word-left",
};

const SS3: Record<string, Key["type"]> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
};

const CONTROL: Record<string, Key["type"]> = {
  "\r": "enter",
  "\n": "enter",
  "\t": "tab",
  "\x7f": "backspace",
  "\b": "backspace",
  "\x01": "home",
  "\x05": "end",
  "\x02": "left",
  "\x06": "right",
  "\x10": "up",
  "\x0e": "down",
  "\x03": "interrupt",
  "\x04": "eof",
  "\x0c": "clear",
  "\x15": "kill-start",
  "\x17": "kill-word",
};

export function parseKeys(data: string): Key[] {
  const keys: Key[] = [];
  let text = "";
  const flush = () => {
    if (text) keys.push({ type: "text", text });
    text = "";
  };
  const push = (type: Key["type"]) => {
    flush();
    keys.push({ type } as Key);
  };

  for (let i = 0; i < data.length; i += 1) {
    const char = data[i]!;

    if (char === "\x1b") {
      const next = data[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < data.length && !/[@-~]/.test(data[j]!)) j += 1;
        const body = data.slice(i + 2, j + 1);
        const type = CSI[body];
        if (type) push(type);
        i = j;
      } else if (next === "O") {
        const type = SS3[data[i + 2] ?? ""];
        if (type) push(type);
        i += 2;
      } else if (next === "b" || next === "f") {
        push(next === "b" ? "word-left" : "word-right");
        i += 1;
      } else if (next === "\x7f" || next === "\b") {
        push("kill-word");
        i += 1;
      } else if (next === undefined) {
        push("escape");
      }
      else i += 1;
      continue;
    }

    if (char === "\r" && data[i + 1] === "\n") i += 1;

    const control = CONTROL[char];
    if (control) {
      push(control);
      continue;
    }

    if (char < " ") continue;
    text += char;
  }

  flush();
  return keys;
}

export function printable(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
  return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export function toTerminal(lines: string[]): string {
  return lines
    .map((line) => printable(line))
    .join("\n")
    .replace(/\n/g, "\r\n");
}

const inline = (text: string) => printable(text).replace(/[\t\n]/g, " ");

const isWordChar = (char: string) => /[\p{L}\p{N}_]/u.test(char);

export class LineEditor {
  private chars: string[] = [];
  private cursor = 0;
  private prompt = "";
  private promptWidth = 0;
  private row = 0;

  private readonly cols: () => number;

  constructor(cols: () => number) {
    this.cols = cols;
  }

  get line(): string {
    return this.chars.join("");
  }

  get caret(): number {
    return this.chars.slice(0, this.cursor).join("").length;
  }

  get empty(): boolean {
    return this.chars.length === 0;
  }

  begin(prompt: string, width: number): string {
    this.prompt = prompt;
    this.promptWidth = width;
    return this.draw();
  }

  leave(): string {
    const caret = this.cursor;
    this.cursor = this.chars.length;
    const { total } = this.layout(Math.max(1, this.cols()));
    const filled = total > 0 && total % Math.max(1, this.cols()) === 0;
    const out = filled ? this.draw() : `${this.draw()}\r\n`;
    this.cursor = caret;
    this.row = 0;
    return out;
  }

  cleared(): void {
    this.row = 0;
  }

  set(line: string, caret = line.length): string {
    this.chars = Array.from(inline(line));
    this.cursor = Array.from(inline(line.slice(0, caret))).length;
    return this.draw();
  }

  insert(text: string): string {
    const added = Array.from(inline(text));
    this.chars.splice(this.cursor, 0, ...added);
    this.cursor += added.length;
    return this.draw();
  }

  edit(key: Key): string | null {
    switch (key.type) {
      case "text":
        return this.insert(key.text);
      case "backspace":
        if (this.cursor === 0) return "";
        this.chars.splice(this.cursor - 1, 1);
        this.cursor -= 1;
        return this.draw();
      case "delete":
        if (this.cursor === this.chars.length) return "";
        this.chars.splice(this.cursor, 1);
        return this.draw();
      case "left":
        return this.moveTo(this.cursor - 1);
      case "right":
        return this.moveTo(this.cursor + 1);
      case "home":
        return this.moveTo(0);
      case "end":
        return this.moveTo(this.chars.length);
      case "word-left":
        return this.moveTo(this.wordStart());
      case "word-right":
        return this.moveTo(this.wordEnd());
      case "kill-start":
        this.chars.splice(0, this.cursor);
        this.cursor = 0;
        return this.draw();
      case "kill-word": {
        const start = this.wordStart();
        this.chars.splice(start, this.cursor - start);
        this.cursor = start;
        return this.draw();
      }
      default:
        return null;
    }
  }

  commit(): { line: string; out: string } {
    const line = this.line;
    const out = this.leave();
    this.chars = [];
    this.cursor = 0;
    return { line, out };
  }

  abandon(): string {
    this.cursor = this.chars.length;
    const out = `${this.draw()}^C\r\n`;
    this.chars = [];
    this.cursor = 0;
    this.row = 0;
    return out;
  }

  private moveTo(index: number): string {
    const next = Math.max(0, Math.min(this.chars.length, index));
    if (next === this.cursor) return "";
    this.cursor = next;
    return this.draw();
  }

  private wordStart(): number {
    let i = this.cursor;
    while (i > 0 && !isWordChar(this.chars[i - 1]!)) i -= 1;
    while (i > 0 && isWordChar(this.chars[i - 1]!)) i -= 1;
    return i;
  }

  private wordEnd(): number {
    let i = this.cursor;
    const n = this.chars.length;
    while (i < n && !isWordChar(this.chars[i]!)) i += 1;
    while (i < n && isWordChar(this.chars[i]!)) i += 1;
    return i;
  }

  private layout(cols: number): { total: number; at: number } {
    let offset = this.promptWidth;
    let at = offset;
    this.chars.forEach((char, i) => {
      const width = cols > 1 ? cellWidth(char) : 1;
      if (width === 2 && offset % cols === cols - 1) offset += 1;
      if (i === this.cursor) at = offset;
      offset += width;
    });
    if (this.cursor === this.chars.length) at = offset;
    return { total: offset, at };
  }

  private draw(): string {
    const cols = Math.max(1, this.cols());
    let out = this.row > 0 ? `\x1b[${this.row}A` : "";
    out += `\r\x1b[J${this.prompt}${this.line}`;

    const { total, at } = this.layout(cols);
    if (total > 0 && total % cols === 0) out += "\r\n";

    const endRow = Math.floor(total / cols);
    const row = Math.floor(at / cols);
    const col = at % cols;

    if (endRow > row) out += `\x1b[${endRow - row}A`;
    out += "\r";
    if (col > 0) out += `\x1b[${col}C`;

    this.row = row;
    return out;
  }
}
