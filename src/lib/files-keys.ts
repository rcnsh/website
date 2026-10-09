// The /files browser's keyboard model, as a pure mapping from a key press to
// an action. The component decides whether the press is its to take at all.

export type KeyAction =
  | { type: "move"; by: number }
  | { type: "first" }
  | { type: "last" }
  | { type: "open" }
  | { type: "up" }
  | { type: "search" }
  | { type: "sort" }
  | { type: "reverse" }
  | { type: "view" }
  | { type: "copy" }
  | { type: "toggle-play" }
  | { type: "escape" };

export type KeyPress = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export type KeyContext = {
  view: "list" | "grid";
  /** Cards per row in the grid, so j/k move a whole row. */
  columns: number;
};

/**
 * The action for a key press, or null to leave it alone. Modified presses are
 * never taken: ⌘K belongs to the palette, and the browser's own shortcuts stay
 * the browser's.
 */
export function keyAction(press: KeyPress, context: KeyContext): KeyAction | null {
  if (press.metaKey || press.ctrlKey || press.altKey) return null;
  const grid = context.view === "grid";
  const row = grid ? Math.max(1, context.columns) : 1;

  switch (press.key) {
    case "j":
    case "ArrowDown":
      return { type: "move", by: row };
    case "k":
    case "ArrowUp":
      return { type: "move", by: -row };
    case "ArrowRight":
      return grid ? { type: "move", by: 1 } : { type: "open" };
    case "ArrowLeft":
      return grid ? { type: "move", by: -1 } : { type: "up" };
    case "l":
    case "Enter":
      return { type: "open" };
    case "h":
    case "Backspace":
      return { type: "up" };
    case "g":
    case "Home":
      return { type: "first" };
    case "G":
    case "End":
      return { type: "last" };
    case "/":
      return { type: "search" };
    case "s":
      return { type: "sort" };
    case "r":
      return { type: "reverse" };
    case "v":
      return { type: "view" };
    case "y":
      return { type: "copy" };
    case " ":
      return { type: "toggle-play" };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}

/** A selection index kept inside a list of `length`, or -1 when it is empty. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(length - 1, index));
}
