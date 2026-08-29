import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDS,
  complete,
  dir,
  file,
  resolvePath,
  run,
  type ShellState,
} from "./shell.ts";

const root = dir("", [
  file("about.txt", "hello\nworld\nastro rules"),
  dir(
    "blog",
    [
      file("first.md", "one\ntwo", "/blog/first"),
      file("astro-notes.md", "three"),
    ],
    "/blog",
  ),
]);

const state = (cwd = "/"): ShellState => ({ root, cwd, history: [] });

describe("resolvePath", () => {
  it("resolves relative, absolute, . and ..", () => {
    assert.equal(resolvePath("/blog", "first.md"), "/blog/first.md");
    assert.equal(resolvePath("/blog", "/about.txt"), "/about.txt");
    assert.equal(resolvePath("/blog", ".."), "/");
    assert.equal(resolvePath("/blog", "../about.txt"), "/about.txt");
    // Climbing past the root stays at the root rather than escaping it.
    assert.equal(resolvePath("/", "../../.."), "/");
  });
});

describe("run", () => {
  it("lists a directory", () => {
    const result = run(state(), "ls");
    assert.deepEqual(result.output, ["about.txt", "blog/"]);
    assert.equal(result.failed, false);
  });

  it("changes directory and reports it", () => {
    const cd = run(state(), "cd blog");
    assert.equal(cd.cwd, "/blog");
    assert.deepEqual(run(state("/blog"), "pwd").output, ["/blog"]);
  });

  it("refuses to cd into a file", () => {
    const result = run(state(), "cd about.txt");
    assert.equal(result.failed, true);
    assert.match(result.output[0]!, /Not a directory/);
  });

  it("cats a file", () => {
    assert.deepEqual(run(state(), "cat about.txt").output, [
      "hello",
      "world",
      "astro rules",
    ]);
  });

  it("reports a missing file the way coreutils does", () => {
    const result = run(state(), "cat nope.txt");
    assert.equal(result.failed, true);
    assert.match(result.output[0]!, /No such file or directory/);
  });

  it("pipes between commands", () => {
    const result = run(state(), "cat about.txt | grep astro");
    assert.deepEqual(result.output, ["astro rules"]);
  });

  it("counts through a pipeline", () => {
    const result = run(state(), "ls | wc -l");
    assert.deepEqual(result.output, ["      2"]);
  });

  it("honours grep -v and -i", () => {
    // Every fixture line contains "o", so -v on it must return nothing.
    assert.deepEqual(run(state(), "cat about.txt | grep -v o").output, []);
    assert.deepEqual(run(state(), "cat about.txt | grep -v hello").output, [
      "world",
      "astro rules",
    ]);
    assert.deepEqual(run(state(), "cat about.txt | grep -i HELLO").output, [
      "hello",
    ]);
  });

  it("takes head -n", () => {
    assert.deepEqual(run(state(), "cat about.txt | head -n 2").output, [
      "hello",
      "world",
    ]);
  });

  it("respects quoting", () => {
    assert.deepEqual(run(state(), 'echo "one   two"').output, ["one   two"]);
  });

  it("finds by glob", () => {
    const result = run(state(), "find / -name *.md");
    assert.deepEqual(result.output.sort(), [
      "/blog/astro-notes.md",
      "/blog/first.md",
    ]);
  });

  it("reports an unknown command", () => {
    /*
      Deliberately nonsense. This used to be `sl`, which was a poor choice —
      it is a well-known joke utility and duly got implemented, so the test
      broke for the wrong reason. The guard below fails with an explanation
      rather than an inscrutable false !== true if that happens again.
    */
    const name = "frobnicate";
    assert.ok(!(name in COMMANDS), `${name} is a real command now — rename it`);

    const result = run(state(), name);
    assert.equal(result.failed, true);
    assert.deepEqual(result.output, [`sh: ${name}: command not found`]);
  });

  it("rejects unsupported operators rather than ignoring them", () => {
    const result = run(state(), "ls > out.txt");
    assert.equal(result.failed, true);
    assert.match(result.output[0]!, /not supported/);
  });

  it("opens a file that maps to a page", () => {
    const result = run(state(), "xdg-open blog/first.md");
    assert.equal(result.navigate, "/blog/first");
  });

  it("refuses to open a file with no page behind it", () => {
    const result = run(state(), "xdg-open blog/astro-notes.md");
    assert.equal(result.failed, true);
    assert.equal(result.navigate, undefined);
  });

  it("signals clear without printing anything", () => {
    const result = run(state(), "clear");
    assert.equal(result.cleared, true);
    assert.deepEqual(result.output, []);
  });

  it("does nothing for an empty line", () => {
    const result = run(state(), "   ");
    assert.deepEqual(result.output, []);
    assert.equal(result.failed, false);
  });
});

describe("complete", () => {
  const tab = (line: string, cwd = "/", cursor?: number) =>
    complete(state(cwd), line, cursor);

  it("completes a unique command and ends the word", () => {
    const result = tab("hel");
    assert.equal(result.line, "help ");
    assert.equal(result.cursor, 5);
    assert.deepEqual(result.candidates, []);
  });

  it("collapses several commands to their common prefix", () => {
    // hostname and head share "h", history too — so "h" cannot advance.
    const result = tab("h");
    assert.equal(result.line, "h");
    assert.ok(result.candidates.includes("head"));
    assert.ok(result.candidates.includes("help"));
  });

  it("completes a file and adds a trailing space", () => {
    assert.equal(tab("cat abo").line, "cat about.txt ");
  });

  it("completes a directory with a slash and no space", () => {
    assert.equal(tab("cd bl").line, "cd blog/");
  });

  it("completes inside a directory prefix", () => {
    assert.equal(tab("cat blog/fir").line, "cat blog/first.md ");
  });

  it("lists matches when the common prefix adds nothing", () => {
    // first.md and astro-notes.md share no prefix, so both are offered.
    const result = tab("cat blog/");
    assert.deepEqual(result.candidates.sort(), ["astro-notes.md", "first.md"]);
    assert.equal(result.line, "cat blog/");
  });

  it("completes a command after a pipe", () => {
    assert.equal(tab("ls | gre").line, "ls | grep ");
  });

  it("respects the working directory", () => {
    assert.equal(tab("cat fir", "/blog").line, "cat first.md ");
  });

  it("completes the word under the caret, not the end of the line", () => {
    const line = "cat abo | wc -l";
    const result = tab(line, "/", 7);
    assert.equal(result.line, "cat about.txt  | wc -l");
    // Caret lands after the inserted word, not at the end of the line.
    assert.equal(result.cursor, 14);
  });

  it("leaves the line alone when nothing matches", () => {
    assert.equal(tab("cat zzz").line, "cat zzz");
    assert.equal(tab("zzz").line, "zzz");
  });

  it("does not fall over on a path that is not a directory", () => {
    assert.equal(tab("cat about.txt/no").line, "cat about.txt/no");
  });
});
