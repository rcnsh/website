import { cellWidth } from "./cell-width.ts";
import { type Key, LineEditor, parseKeys, printable, toTerminal } from "./line-editor.ts";
import { complete, run, type ShellState } from "./shell.ts";

export type SessionHost = {
  write: (data: string) => void;
  cols: () => number;
  navigate: (href: string) => void;
  exit: () => void;
};

export type SessionState = ShellState;

const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const FAINT = "\x1b[90m";
const RESET = "\x1b[0m";
const CLEAR = "\x1b[2J\x1b[3J\x1b[H";

export const BANNER = `${FAINT}Type help for the commands, ls to look around. exit, or backspace on an empty line, goes back to search.${RESET}\r\n`;

const EXIT = /^\s*(exit|logout)(\s|$)/;

export function createSession(state: SessionState, host: SessionHost) {
  const editor = new LineEditor(host.cols);
  let recall = -1;
  let draft = "";
  let away = false;
  const exit = () => {
    away = true;
    host.exit();
  };

  const prompt = () => {
    const cwd = printable(state.cwd);
    const out = editor.begin(
      `${BLUE}${cwd}${RESET} ${FAINT}$${RESET} `,
      Array.from(cwd).reduce((width, char) => width + cellWidth(char), 0) + 3,
    );
    host.write(out);
  };

  const submit = () => {
    const { line, out } = editor.commit();
    host.write(out);
    recall = -1;
    draft = "";

    if (EXIT.test(line)) {
      state.history.push(line);
      exit();
      return;
    }

    const result = run(state, line);
    if (line.trim()) state.history.push(line);

    if (result.cleared) host.write(CLEAR);
    if (result.output.length > 0) {
      const text = toTerminal(result.output);
      host.write(result.failed ? `${RED}${text}${RESET}\r\n` : `${text}\r\n`);
    }

    state.cwd = result.cwd;
    if (result.navigate) host.navigate(result.navigate);
    prompt();
  };

  const tab = () => {
    const result = complete(state, editor.line, editor.caret);

    if (result.candidates.length > 0) {
      host.write(`${editor.leave()}${toTerminal([result.candidates.join("  ")])}\r\n`);
      prompt();
      return;
    }
    if (result.line !== editor.line || result.cursor !== editor.caret) {
      host.write(editor.set(result.line, result.cursor));
    }
  };

  const browse = (direction: -1 | 1) => {
    const { history } = state;
    let next: number;
    if (direction === -1) {
      if (history.length === 0) return;
      next = recall === -1 ? history.length - 1 : Math.max(recall - 1, 0);
    } else {
      if (recall === -1) return;
      next = recall + 1 >= history.length ? -1 : recall + 1;
    }
    if (recall === -1) draft = editor.line;
    recall = next;
    host.write(editor.set(recall === -1 ? draft : history[recall]!));
  };

  const press = (key: Key) => {
    switch (key.type) {
      case "enter":
        return submit();
      case "tab":
        return tab();
      case "up":
        return browse(-1);
      case "down":
        return browse(1);
      case "interrupt":
        host.write(editor.abandon());
        recall = -1;
        return prompt();
      case "clear":
        host.write(CLEAR);
        editor.cleared();
        return prompt();
      case "eof":
        if (editor.empty) return exit();
        return host.write(editor.edit({ type: "delete" }) ?? "");
      case "backspace":
        if (editor.empty) return exit();
        break;
      case "escape":
        return;
    }
    const out = editor.edit(key);
    if (out) host.write(out);
  };

  return {
    start(banner: boolean) {
      away = false;
      if (banner) host.write(BANNER);
      prompt();
    },
    feed(data: string) {
      for (const key of parseKeys(data)) {
        if (away) return;
        press(key);
      }
    },
  };
}
