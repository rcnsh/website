import { WTerm } from "@wterm/dom";
import { createSession, type SessionState } from "./shell-session.ts";

/**
 * The palette's `$` shell, drawn by wterm. Loaded with `import()` on the first
 * `$`, so neither wterm nor its WASM core is in the page bundle. Its CSS is,
 * imported by CommandPalette: see CLAUDE.md § Palette shell.
 */

export type PaletteTerminal = {
  /** Shows the prompt again after the session handed back to search. */
  resume: () => void;
  /** Feeds text to the prompt as if typed. */
  type: (text: string) => void;
  focus: () => void;
  destroy: () => void;
};

export async function mountTerminal(
  host: HTMLElement,
  state: SessionState,
  options: {
    /** True on the first terminal of the visit: later ones skip the banner. */
    banner: boolean;
    navigate: (href: string) => void;
    exit: () => void;
  },
): Promise<PaletteTerminal> {
  // Sized by `host`'s own height, which holds while the palette shows search:
  // init() measures it, and a row written to a grid that later narrows is cut.
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
