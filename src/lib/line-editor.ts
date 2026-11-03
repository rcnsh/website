/**
 * Readline for a terminal that hands us raw keystrokes: turns them into keys,
 * keeps the line being typed, and redraws it with escape sequences. No DOM and
 * no wterm import, so it tests under node.
 *
 * Every character counts as one column. Wide characters (CJK, emoji) in a
 * typed line would put the cursor off by one per character; nothing on the
 * site needs them typed.
 */

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

/** CSI sequences, keyed by their parameters and final byte. */
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
  // Ctrl or Alt with an arrow.
  "1;5C": "word-right",
  "1;5D": "word-left",
  "1;3C": "word-right",
  "1;3D": "word-left",
};

/** SS3 sequences: arrows and Home/End in application-cursor mode. */
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

/** Splits one chunk of terminal input into keys. Unknown sequences are dropped. */
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
        // Parameters, then one final byte in @–~.
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
      // Any other Alt+key is dropped along with its ESC.
      else i += 1;
      continue;
    }

    if (char === "\r" && data[i + 1] === "\n") i += 1;

    const control = CONTROL[char];
    if (control) {
      push(control);
      continue;
    }

    // Remaining C0 controls and DEL say nothing a prompt can use.
    if (char < " ") continue;
    text += char;
  }

  flush();
  return keys;
}

/** Removes everything a terminal would act on rather than print, keeping tabs and newlines. */
export function printable(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
  return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

/** Lines for the terminal: control characters stripped, CRLF between them. */
export function toTerminal(lines: string[]): string {
  return lines
    .map((line) => printable(line))
    .join("\n")
    .replace(/\n/g, "\r\n");
}

/** One printed column per code point: no controls, and no tabs or newlines either. */
const inline = (text: string) => printable(text).replace(/[\t\n]/g, " ");

const isWordChar = (char: string) => /[\p{L}\p{N}_]/u.test(char);

export class LineEditor {
  /** The line, one entry per code point, so the cursor never splits a pair. Never holds a control character. */
  private chars: string[] = [];
  private cursor = 0;
  private prompt = "";
  private promptWidth = 0;
  /** Which row of the drawn line the terminal's cursor is on, for the next redraw. */
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

  /**
   * Draws the prompt and whatever is typed, from the top row of the line drawn
   * last, so a line left mid-edit is redrawn in place. After `leave()`,
   * `commit()`, `abandon()` or `cleared()` that top row is the cursor's own.
   * `width` is the prompt's printed width, since `prompt` may carry colour.
   */
  begin(prompt: string, width: number): string {
    this.prompt = prompt;
    this.promptWidth = width;
    return this.draw();
  }

  /** Steps below the drawn line, keeping what is typed, for output that belongs under it. */
  leave(): string {
    const caret = this.cursor;
    this.cursor = this.chars.length;
    // A line that exactly fills its last row is already followed by a fresh one.
    const total = this.promptWidth + this.chars.length;
    const filled = total > 0 && total % Math.max(1, this.cols()) === 0;
    const out = filled ? this.draw() : `${this.draw()}\r\n`;
    this.cursor = caret;
    this.row = 0;
    return out;
  }

  /** The screen was cleared and the cursor sent home. */
  cleared(): void {
    this.row = 0;
  }

  /** Replaces the line, caret at `caret` (a UTF-16 index, as completion reports it) or the end. */
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

  /** Applies an editing key; null when the key is not an edit. */
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

  /** Ends the line: the caret goes past it and the line is handed back, editor emptied. */
  commit(): { line: string; out: string } {
    const line = this.line;
    const out = this.leave();
    this.chars = [];
    this.cursor = 0;
    return { line, out };
  }

  /** The line as it stands, abandoned (Ctrl+C): left on screen, editor emptied. */
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

  /**
   * Redraws prompt and line from the top row of the drawn line, which may
   * wrap, then puts the cursor back on the caret.
   */
  private draw(): string {
    const cols = Math.max(1, this.cols());
    let out = this.row > 0 ? `\x1b[${this.row}A` : "";
    out += `\r\x1b[J${this.prompt}${this.line}`;

    const total = this.promptWidth + this.chars.length;
    // A line that exactly fills its last row leaves the cursor parked on that
    // row's last column; step onto the next row so the arithmetic below holds.
    if (total > 0 && total % cols === 0) out += "\r\n";

    const endRow = Math.floor(total / cols);
    const at = this.promptWidth + this.cursor;
    const row = Math.floor(at / cols);
    const col = at % cols;

    if (endRow > row) out += `\x1b[${endRow - row}A`;
    out += "\r";
    if (col > 0) out += `\x1b[${col}C`;

    this.row = row;
    return out;
  }
}
