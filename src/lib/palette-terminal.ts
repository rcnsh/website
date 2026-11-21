import { WTerm } from "@wterm/dom";
import { createSession, type SessionState } from "./shell-session.ts";

export type PaletteTerminal = {
  resume: () => void;
  type: (text: string) => void;
  focus: () => void;
  destroy: () => void;
};

export async function mountTerminal(
  host: HTMLElement,
  state: SessionState,
  options: {
    banner: boolean;
    navigate: (href: string) => void;
    exit: () => void;
  },
): Promise<PaletteTerminal> {
  const term = new WTerm(host, { cursorBlink: true });
  await term.init();

  const session = createSession(state, {
    write: (data) => term.write(data),
    cols: () => term.cols,
    navigate: options.navigate,
    exit: options.exit,
  });
  term.onData = (data) => session.feed(data);
  session.start(options.banner);

  return {
    resume: () => session.start(false),
    type: (text) => session.feed(text),
    focus: () => term.focus(),
    destroy: () => term.destroy(),
  };
}
