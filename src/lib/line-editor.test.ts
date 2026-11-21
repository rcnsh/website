import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellWidth } from "./cell-width.ts";
import { LineEditor, parseKeys, printable, toTerminal } from "./line-editor.ts";

function screen(cols: number) {
  let rows: string[][] = [[]];
  let row = 0;
  let col = 0;
  let pendingWrap = false;

  const ensure = (r: number) => {
    while (rows.length <= r) rows.push([]);
  };

  const write = (data: string) => {
    const chars = Array.from(data);
    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i]!;
      if (char === "\x1b") {
        let j = i + 2;
        while (!/[@-~]/.test(chars[j]!)) j += 1;
        const param = Number(chars.slice(i + 2, j).join("")) || 1;
        const final = chars[j];
        if (final === "A") row = Math.max(0, row - param);
        if (final === "C") col = Math.min(cols - 1, col + param);
        if (final === "J") {
          rows[row] = rows[row]!.slice(0, col);
          rows = rows.slice(0, row + 1);
        }
        pendingWrap = false;
        i = j;
      } else if (char === "\r") {
        col = 0;
        pendingWrap = false;
      } else if (char === "\n") {
        row += 1;
        ensure(row);
        pendingWrap = false;
      } else {
        const width = cols > 1 ? cellWidth(char) : 1;
        if (pendingWrap || col + width > cols) {
          row += 1;
          col = 0;
          ensure(row);
          pendingWrap = false;
        }
        rows[row]![col] = char;
        if (width === 2) rows[row]![col + 1] = "";
        if (col + width >= cols) {
          col = cols - 1;
          pendingWrap = true;
        } else col += width;
      }
    }
  };

  return {
    write,
    text: () => rows.map((cells) => cells.join("")).join("\n"),
    cursor: () => ({ row, col }),
  };
}

describe("parseKeys", () => {
  it("collects text and splits out control keys", () => {
    assert.deepEqual(parseKeys("ls -l\r"), [
      { type: "text", text: "ls -l" },
      { type: "enter" },
    ]);
  });

  it("reads arrows in both cursor modes, and Home, End and Delete", () => {
    assert.deepEqual(
      parseKeys("\x1b[A\x1bOB\x1b[C\x1b[D\x1b[H\x1bOF\x1b[3~").map((k) => k.type),
      ["up", "down", "right", "left", "home", "end", "delete"],
    );
  });

  it("reads word motion from Ctrl/Alt arrows and Alt+b/f", () => {
    assert.deepEqual(
      parseKeys("\x1b[1;5D\x1b[1;3C\x1bb\x1bf\x1b\x7f").map((k) => k.type),
      ["word-left", "word-right", "word-left", "word-right", "kill-word"],
    );
  });

  it("treats a lone ESC as Escape and drops unknown sequences", () => {
    assert.deepEqual(parseKeys("\x1b"), [{ type: "escape" }]);
    assert.deepEqual(parseKeys("\x1b[15~a"), [{ type: "text", text: "a" }]);
  });

  it("runs a pasted CRLF once, not twice", () => {
    assert.deepEqual(
      parseKeys("pwd\r\nls").map((k) => k.type),
      ["text", "enter", "text"],
    );
  });

  it("drops control characters it has no use for", () => {
    assert.deepEqual(parseKeys("a\x07b"), [{ type: "text", text: "ab" }]);
  });
});

describe("printable / toTerminal", () => {
  it("strips escape sequences' ESC and C1 controls, keeping tabs and newlines", () => {
    assert.equal(printable("\x1b]52;c;aGk=\x07ok\tyes\x9b"), "]52;c;aGk=ok\tyes");
  });

  it("joins and breaks lines with CRLF", () => {
    assert.equal(toTerminal(["a", "b\nc"]), "a\r\nb\r\nc");
  });
});

describe("LineEditor", () => {
  const setup = (cols = 80) => {
    const term = screen(cols);
    const editor = new LineEditor(() => cols);
    term.write(editor.begin("$ ", 2));
    return { term, editor };
  };

  it("inserts and moves the caret mid-line", () => {
    const { term, editor } = setup();
    term.write(editor.insert("lsa"));
    term.write(editor.edit({ type: "left" })!);
    term.write(editor.insert(" -"));
    assert.equal(editor.line, "ls -a");
    assert.equal(term.text(), "$ ls -a");
    assert.deepEqual(term.cursor(), { row: 0, col: 6 });
  });

  it("deletes backwards and forwards", () => {
    const { term, editor } = setup();
    term.write(editor.insert("abcd"));
    term.write(editor.edit({ type: "home" })!);
    term.write(editor.edit({ type: "delete" })!);
    term.write(editor.edit({ type: "end" })!);
    term.write(editor.edit({ type: "backspace" })!);
    assert.equal(editor.line, "bc");
    assert.equal(term.text(), "$ bc");
  });

  it("kills a word and the start of the line", () => {
    const { editor } = setup();
    editor.insert("cat /blog/first.md");
    editor.edit({ type: "kill-word" });
    assert.equal(editor.line, "cat /blog/first.");
    editor.edit({ type: "kill-start" });
    assert.equal(editor.line, "");
  });

  it("moves by words", () => {
    const { editor } = setup();
    editor.insert("grep astro notes");
    editor.edit({ type: "word-left" });
    assert.equal(editor.caret, 11);
    editor.edit({ type: "word-left" });
    editor.edit({ type: "word-right" });
    assert.equal(editor.caret, 10);
  });

  it("redraws a line that wraps, with the caret on an earlier row", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefghijklmnop"));
    assert.equal(term.text(), "$ abcdefgh\nijklmnop");
    assert.deepEqual(term.cursor(), { row: 1, col: 8 });

    term.write(editor.edit({ type: "home" })!);
    assert.deepEqual(term.cursor(), { row: 0, col: 2 });

    term.write(editor.insert("X"));
    assert.equal(term.text(), "$ Xabcdefg\nhijklmnop");
    assert.deepEqual(term.cursor(), { row: 0, col: 3 });

    term.write(editor.edit({ type: "kill-start" })!);
    term.write(editor.edit({ type: "end" })!);
    assert.deepEqual(term.cursor(), { row: 1, col: 8 });
  });

  it("puts the caret on the next row when the line exactly fills one", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefgh"));
    assert.deepEqual(term.cursor(), { row: 1, col: 0 });
    term.write(editor.insert("i"));
    assert.equal(term.text(), "$ abcdefgh\ni");
    assert.deepEqual(term.cursor(), { row: 1, col: 1 });
    term.write(editor.edit({ type: "backspace" })!);
    term.write(editor.edit({ type: "backspace" })!);
    assert.equal(term.text(), "$ abcdefg");
    assert.deepEqual(term.cursor(), { row: 0, col: 9 });
  });

  it("commits from mid-line onto a fresh row below a wrapped line", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefghijk"));
    term.write(editor.edit({ type: "home" })!);
    const { line, out } = editor.commit();
    term.write(out);
    assert.equal(line, "abcdefghijk");
    assert.deepEqual(term.cursor(), { row: 2, col: 0 });
    assert.ok(editor.empty);
  });

  it("commits a line that exactly fills its last row without a blank row after it", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefgh"));
    term.write(editor.commit().out);
    term.write("OUT");
    assert.equal(term.text(), "$ abcdefgh\nOUT");
  });

  it("leaves from an earlier row of a wrapped line without overprinting it", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefghijklmnop"));
    term.write(editor.edit({ type: "home" })!);
    term.write(`${editor.leave()}listed\r\n`);
    term.write(editor.begin("$ ", 2));
    assert.equal(term.text(), "$ abcdefgh\nijklmnop\nlisted\n$ abcdefgh\nijklmnop");
    assert.equal(editor.caret, 0);
    assert.deepEqual(term.cursor(), { row: 3, col: 2 });
  });

  it("redraws a line left mid-edit in place when the prompt begins again", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abcdefghijklmnop"));
    term.write(editor.begin("$ ", 2));
    assert.equal(term.text(), "$ abcdefgh\nijklmnop");
    assert.deepEqual(term.cursor(), { row: 1, col: 8 });
  });

  it("never prints control characters typed into the line", () => {
    const { term, editor } = setup();
    term.write(editor.set("a\x1b[2Jb"));
    assert.equal(term.text(), "$ a[2Jb");
  });

  it("places the caret after wide characters by their two columns", () => {
    const { term, editor } = setup();
    term.write(editor.insert("cat 漢字🙂"));
    assert.equal(term.text(), "$ cat 漢字🙂");
    assert.deepEqual(term.cursor(), { row: 0, col: 12 });
    term.write(editor.edit({ type: "left" })!);
    assert.deepEqual(term.cursor(), { row: 0, col: 10 });
    term.write(editor.insert("x"));
    assert.equal(term.text(), "$ cat 漢字x🙂");
    assert.deepEqual(term.cursor(), { row: 0, col: 11 });
  });

  it("wraps a line of wide characters by width", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("漢字漢字漢字"));
    assert.equal(term.text(), "$ 漢字漢字\n漢字");
    assert.deepEqual(term.cursor(), { row: 1, col: 4 });
    term.write(editor.edit({ type: "home" })!);
    assert.deepEqual(term.cursor(), { row: 0, col: 2 });
    term.write(editor.edit({ type: "end" })!);
    assert.deepEqual(term.cursor(), { row: 1, col: 4 });
  });

  it("follows a wide character that wraps early past the last column", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("abc漢字漢"));
    assert.equal(term.text(), "$ abc漢字\n漢");
    assert.deepEqual(term.cursor(), { row: 1, col: 2 });
    term.write(editor.edit({ type: "left" })!);
    assert.deepEqual(term.cursor(), { row: 1, col: 0 });
    term.write(editor.edit({ type: "left" })!);
    assert.deepEqual(term.cursor(), { row: 0, col: 7 });
    term.write(editor.edit({ type: "end" })!);
    term.write(editor.commit().out);
    term.write("OUT");
    assert.equal(term.text(), "$ abc漢字\n漢\nOUT");
  });

  it("commits a wide line that exactly fills its last row without a blank row", () => {
    const { term, editor } = setup(10);
    term.write(editor.insert("漢字漢字"));
    assert.deepEqual(term.cursor(), { row: 1, col: 0 });
    term.write(editor.commit().out);
    term.write("OUT");
    assert.equal(term.text(), "$ 漢字漢字\nOUT");
  });

  it("keeps surrogate pairs whole", () => {
    const { editor } = setup();
    editor.insert("a🙂");
    editor.edit({ type: "backspace" });
    assert.equal(editor.line, "a");
  });
});
