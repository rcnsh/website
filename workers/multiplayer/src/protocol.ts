/**
 * Everything the room decides that does not need a Durable Object to decide
 * it: what counts as a room, who is allowed to connect, what a valid message
 * looks like, who has spent their budget, and who gets which colour.
 *
 * Split out from index.ts so it can be tested. index.ts imports
 * `cloudflare:workers`, which only resolves inside workerd, so a test that
 * reached for it would not load at all.
 */

export interface Identity {
  id: number;
  name: string;
  colour: string;
}

/** Beyond this the screen is soup, and the fan-out stops being cheap. */
export const MAX_PEERS = 20;

/*
  Deliberately wider than the site's palette, which is one accent on warm
  grey — remote cursors have to be told apart at a glance, and they should not
  read as site chrome. Held at roughly even lightness so no one gets a cursor
  that disappears against #0d0d0c, and each is named by its colour so the
  label explains the arrow it is attached to.
*/
export const COLOURS: ReadonlyArray<readonly [name: string, hex: string]> = [
  ["amber", "#f2a65a"],
  ["coral", "#e8705f"],
  ["rose", "#e05f8f"],
  ["orchid", "#c479e0"],
  ["iris", "#8f86e8"],
  ["azure", "#5f9ce0"],
  ["cyan", "#4fb8c9"],
  ["jade", "#46bd94"],
  ["fern", "#7fc45f"],
  ["citron", "#c9c14f"],
  ["clay", "#e8996a"],
  ["plum", "#d97fb8"],
];

export const ANIMALS = [
  "fox",
  "heron",
  "otter",
  "lynx",
  "marten",
  "ibis",
  "tapir",
  "shrike",
  "badger",
  "gannet",
  "wren",
  "stoat",
  "kite",
  "hare",
  "newt",
  "vole",
] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A cursor position, in the sender's content-column space. */
export interface Move {
  x: number;
  y: number;
}

/**
 * Whether a parsed message is a position update.
 *
 * The socket is unauthenticated, so this is the only thing standing between a
 * hostile client and the room's state. Finite numbers specifically: NaN and
 * Infinity both survive `typeof === "number"` and would poison a cursor's
 * position permanently, since every later frame interpolates from it.
 */
export function isMove(value: unknown): value is { t: "m" } & Move {
  if (typeof value !== "object" || value === null) return false;
  const move = value as Record<string, unknown>;
  return (
    move.t === "m" &&
    typeof move.x === "number" &&
    typeof move.y === "number" &&
    Number.isFinite(move.x) &&
    Number.isFinite(move.y)
  );
}

/**
 * Rooms are keyed by page path, so the cursor you see is pointing at the same
 * paragraph you are looking at. Normalised hard — a room is an identifier, and
 * `/blog/x`, `/blog/x/` and `/blog/X` should not be three of them.
 *
 * Returns null for anything that is not a plausible path on this site. Each
 * distinct key is a Durable Object that can be made to exist by asking for it,
 * so this is what stops a stranger conjuring unbounded numbers of them.
 */
export function roomKey(raw: string | null): string | null {
  if (!raw) return null;

  // Repeated slashes collapse rather than being rejected: a doubled slash in
  // a link is an ordinary typo, it survives into location.pathname, and
  // //blog/x is the same page as /blog/x — so it had better be the same room.
  const path =
    raw
      .toLowerCase()
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "") || "/";
  if (path.length > 128 || !/^\/[a-z0-9\-._/]*$/.test(path)) return null;

  // `.` is legitimate inside a segment — /blog/a-post.v2 — but a segment that
  // is only dots is a relative step, and two spellings of one page would be
  // two rooms. Nothing the client sends can contain one: it passes
  // location.pathname, which the browser has already resolved.
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return path;
}

/**
 * Same-origin only. The socket is unauthenticated and costs Durable Object
 * duration to hold open, so it is not something to leave open to any page on
 * the internet that fancies a free realtime backend.
 */
export function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === "https://rcn.sh") return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return (
      protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * Per-socket message allowance, in a rolling one-second window.
 *
 * Inbound messages are billed as Durable Object requests, so a client that
 * ignores the send cap gets its excess dropped rather than charged.
 */
export class Budget {
  private windows = new Map<number, { until: number; count: number }>();
  private readonly perSecond: number;

  // Assigned longhand rather than as a constructor parameter property: Node
  // runs the tests by stripping types, not compiling them, and a parameter
  // property is syntax that has to be compiled away rather than erased.
  constructor(perSecond: number) {
    this.perSecond = perSecond;
  }

  /** Returns false when this peer has already spent its second. */
  spend(id: number, now: number): boolean {
    const window = this.windows.get(id);

    if (!window || now >= window.until) {
      this.windows.set(id, { until: now + 1000, count: 1 });
      return true;
    }

    window.count += 1;
    return window.count <= this.perSecond;
  }

  forget(id: number) {
    this.windows.delete(id);
  }
}

/**
 * A colour nobody in the room is already using, where possible, so two people
 * are never both "the blue one". Falls back to the whole palette once the room
 * is bigger than it.
 *
 * `random` is injected rather than reached for, so the choice can be pinned in
 * a test.
 */
export function mint(
  taken: readonly Identity[],
  random: () => number = Math.random,
): Identity {
  const usedColours = new Set(taken.map((peer) => peer.colour));
  const usedIds = new Set(taken.map((peer) => peer.id));

  const free = COLOURS.filter(([, hex]) => !usedColours.has(hex));
  const palette = free.length > 0 ? free : COLOURS;
  const [word, colour] = palette[Math.floor(random() * palette.length)];

  /*
    Ids are per-room and short-lived, so 24 bits is far past collision risk at
    MAX_PEERS. The retries cover the rest — but bounded, and with a fallback
    that cannot fail. This runs inside the Durable Object, where an unbounded
    loop does not lose one cursor, it wedges the room for everyone in it, and
    "the random source will never repeat itself enough times" is not a property
    worth betting a hang on.
  */
  let id = 0;
  for (let attempt = 0; attempt < 8 && (id === 0 || usedIds.has(id)); attempt++) {
    id = 1 + Math.floor(random() * 0xff_ff_ff);
  }
  if (id === 0 || usedIds.has(id)) {
    id = 1;
    while (usedIds.has(id)) id += 1;
  }

  return {
    id,
    name: `${word} ${ANIMALS[Math.floor(random() * ANIMALS.length)]}`,
    colour,
  };
}
