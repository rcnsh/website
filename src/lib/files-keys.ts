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
  columns: number;
};

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

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(length - 1, index));
}
