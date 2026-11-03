import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dir, file } from "./shell.ts";
import { BANNER, createSession, type SessionState } from "./shell-session.ts";

const root = dir("", [
  file("about.txt", "hello\x1b]52;c;aGk=\x07"),
  dir("blog", [file("first.md", "one", "/blog/first"), file("fun.md", "two")], "/blog"),
]);

/** Everything written, with colour sequences and cursor moves removed. */
const plain = (data: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escape sequences is the point.
  data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "");

function setup(state: Partial<SessionState> = {}) {
  const writes: string[] = [];
  const events: string[] = [];
  const shell: SessionState = { root, cwd: "/", history: [], ...state };
  const session = createSession(shell, {
    write: (data) => writes.push(data),
    cols: () => 80,
    navigate: (href) => events.push(`navigate ${href}`),
    exit: () => events.push("exit"),
  });
  session.start(false);
  writes.length = 0;
  return { session, shell, writes, events, out: () => plain(writes.join("")) };
}

describe("createSession", () => {
  it("prints the banner only when asked", () => {
    const writes: string[] = [];
    const host = { write: (d: string) => writes.push(d), cols: () => 80, navigate() {}, exit() {} };
    createSession({ root, cwd: "/", history: [] }, host).start(true);
    assert.equal(writes[0], BANNER);
    writes.length = 0;
    createSession({ root, cwd: "/", history: [] }, host).start(false);
    assert.ok(!writes.includes(BANNER));
  });

  it("runs a line and prints its output, then a fresh prompt", () => {
    const { session, out, writes } = setup();
    session.feed("ls");
    writes.length = 0;
    session.feed("\r");
    assert.match(out(), /^\/ \$ ls\nabout\.txt\nblog\/\n\/ \$ $/);
  });

  it("strips control characters from command output", () => {
    const { session, writes } = setup();
    session.feed("cat about.txt\r");
    const all = writes.join("");
    assert.ok(!all.includes("\x07"));
    assert.ok(!all.includes("\x1b]"));
  });

  it("strips control characters from the working directory in the prompt", () => {
    const { session, writes } = setup({ cwd: "/x\x1b]0;title\x07" });
    session.start(false);
    const all = writes.join("");
    assert.ok(!all.includes("\x07"));
    assert.ok(!all.includes("\x1b]"));
  });

  it("colours a failure red", () => {
    const { session, writes } = setup();
    session.feed("cat nope\r");
    assert.ok(writes.some((w) => w.startsWith("\x1b[31m") && w.includes("No such file")));
  });

  it("keeps the working directory in the shared state", () => {
    const { session, shell, out } = setup();
    session.feed("cd blog\r");
    assert.equal(shell.cwd, "/blog");
    assert.ok(out().endsWith("/blog $ "));
  });

  it("records history and walks it with the arrows, keeping the draft", () => {
    const { session, shell, out, writes } = setup();
    session.feed("pwd\rls\r");
    assert.deepEqual(shell.history, ["pwd", "ls"]);

    session.feed("ec");
    session.feed("\x1b[A\x1b[A");
    writes.length = 0;
    session.feed("\r");
    assert.match(out(), /^\/ \$ pwd\n\/\n/);

    session.feed("ec\x1b[A\x1b[B");
    writes.length = 0;
    session.feed("ho hi\r");
    assert.match(out(), /echo hi\nhi\n/);
  });

  it("completes a unique match in place and lists an ambiguous one", () => {
    const { session, out, writes } = setup();
    session.feed("cat ab\t");
    assert.ok(out().endsWith("/ $ cat about.txt "));

    session.feed("\x15ls blog/f\t");
    writes.length = 0;
    session.feed("\t");
    assert.match(out(), /first\.md {2}fun\.md\n\/ \$ ls blog\/f$/);
  });

  it("hands xdg-open's target to the host", () => {
    const { session, events } = setup();
    session.feed("xdg-open blog/first.md\r");
    assert.deepEqual(events, ["navigate /blog/first"]);
  });

  it("exits on backspace or Ctrl+D on an empty line, and on `exit`", () => {
    for (const keys of ["\x7f", "\x04", "exit\r", " exit 0\r", "logout\r"]) {
      const { session, events } = setup();
      session.feed(keys);
      assert.deepEqual(events, ["exit"], JSON.stringify(keys));
    }
  });

  it("only edits on backspace or Ctrl+D when the line has text", () => {
    const { session, events } = setup();
    session.feed("ab\x7f\x1b[D\x04");
    assert.deepEqual(events, []);
  });

  it("stops reading a paste at the exit, and resumes with a prompt", () => {
    const { session, events, out, writes } = setup();
    session.feed("exit\rls\r");
    assert.deepEqual(events, ["exit"]);
    assert.ok(!out().includes("about.txt"));

    writes.length = 0;
    session.start(false);
    session.feed("pwd\r");
    assert.match(out(), /\/ \$ pwd\n\/\n/);
  });

  it("abandons the line on Ctrl+C without running it", () => {
    const { session, shell, out } = setup();
    session.feed("ls\x03");
    assert.match(out(), /\/ \$ ls\^C\n\/ \$ $/);
    assert.deepEqual(shell.history, []);
  });

  it("clears the screen for `clear` and Ctrl+L", () => {
    for (const keys of ["clear\r", "\x0c"]) {
      const { session, writes } = setup();
      session.feed(keys);
      assert.ok(writes.some((w) => w.includes("\x1b[2J")), JSON.stringify(keys));
    }
  });
});
