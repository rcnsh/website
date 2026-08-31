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

/**
 * Why a room hung up on purpose.
 *
 * Both of these are answers rather than failures, and the difference matters
 * to the reader: a full room is worth coming back to, a page with no room is
 * not. Neither is worth reconnecting at, which is what a refused handshake
 * gets you — the browser tells a failed upgrade and a dead server apart not at
 * all, so the client backs off and knocks for the rest of the session at
 * something that was never going to change its mind.
 *
 * So a refusal is a socket that opens, says one word and closes.
 */
export type ShutReason = "full" | "unknown";

/** Application close codes start at 4000; anything below is the protocol's. */
export const CLOSE_SHUT = 4001;

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
 * Returns null for anything that is not a page on this site.
 *
 * `known` is the list of paths the site actually has, generated at build time
 * into shared/rooms.generated.ts. It is not decoration: each distinct key is a
 * Durable Object that comes into existence by being asked for, and the shape
 * checks below pass `/aaa`, `/aab` and every other spelling a script cares to
 * try. The Origin check in front only binds clients that respect it. Called
 * without a list — as the generator itself does, to normalise the entries
 * going into one — it checks the shape and nothing else.
 */
export function roomKey(
  raw: string | null,
  known?: ReadonlySet<string>,
): string | null {
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

  if (known && !known.has(path)) return null;

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
 * An opaque client-supplied token, or null for anything that is not one.
 *
 * Untrusted by construction: all it decides is which arrow and which animal
 * someone is given, so there is nothing to be had by borrowing another's. The
 * bounds are because it is a string from a stranger that gets hashed, and a
 * hash is a poor place to discover you were handed a megabyte.
 */
export function sessionSeed(raw: string | null): string | null {
  if (!raw) return null;
  return /^[a-z0-9]{1,64}$/i.test(raw) ? raw : null;
}

/**
 * FNV-1a, 32-bit. Not a security property — it is here to turn a token into
 * the same two small numbers every time, so a reader keeps their cursor across
 * a reconnection and a walk to the next page.
 */
function hash(text: string): number {
  let value = 0x81_1c_9d_c5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01_00_01_93);
  }
  return value >>> 0;
}

/**
 * A colour nobody in the room is already using, where possible, so two people
 * are never both "the blue one". Falls back to the whole palette once the room
 * is bigger than it.
 *
 * `random` is injected rather than reached for, so the choice can be pinned in
 * a test.
 *
 * `seed` is the caller's session token, and it is what stops one reader
 * looking like a crowd. Identity used to be minted per socket, and the socket
 * is dropped on every idle timeout, tab switch and navigation — so one person
 * reading three posts arrived and left three times, under three names, in a
 * room where two of those names were the only other thing on screen.
 *
 * The animal is the stable half: it comes from the seed and nothing else, so
 * you are the same fox all session. The colour is preferred from the seed but
 * gives way to a free one when your colour is already in the room, because
 * telling two cursors apart is what the colours are for, and the name follows
 * the colour so the label never describes an arrow of some other shade.
 */
export function mint(
  taken: readonly Identity[],
  random: () => number = Math.random,
  seed: string | null = null,
): Identity {
  const usedColours = new Set(taken.map((peer) => peer.colour));
  const usedIds = new Set(taken.map((peer) => peer.id));

  const free = COLOURS.filter(([, hex]) => !usedColours.has(hex));
  const palette = free.length > 0 ? free : COLOURS;
  const seeded = seed === null ? null : hash(seed);

  const [word, colour] =
    seeded === null
      ? palette[Math.floor(random() * palette.length)]
      : preferred(seeded, usedColours, palette);

  /*
    Ids are per-room and short-lived, so 24 bits is far past collision risk at
    MAX_PEERS. The retries cover the rest — but bounded, and with a fallback
    that cannot fail. This runs inside the Durable Object, where an unbounded
    loop does not lose one cursor, it wedges the room for everyone in it, and
    "the random source will never repeat itself enough times" is not a property
    worth betting a hang on.
  */
  let id = 0;
  if (seeded !== null) {
    // Same reader, same id — which is what makes a "bye" from the old socket
    // and a "join" from the new one recognisable as one person moving.
    const candidate = 1 + (seeded % 0xff_ff_ff);
    if (!usedIds.has(candidate)) id = candidate;
  }
  for (let attempt = 0; attempt < 8 && (id === 0 || usedIds.has(id)); attempt++) {
    id = 1 + Math.floor(random() * 0xff_ff_ff);
  }
  if (id === 0 || usedIds.has(id)) {
    id = 1;
    while (usedIds.has(id)) id += 1;
  }

  const animal =
    seeded === null
      ? ANIMALS[Math.floor(random() * ANIMALS.length)]
      : ANIMALS[(seeded >>> 8) % ANIMALS.length];

  return { id, name: `${word} ${animal}`, colour };
}

/** The seeded colour, or a free one when the room already has that arrow. */
function preferred(
  seeded: number,
  usedColours: ReadonlySet<string>,
  palette: typeof COLOURS,
): (typeof COLOURS)[number] {
  const first = COLOURS[seeded % COLOURS.length];
  return usedColours.has(first[1]) ? palette[seeded % palette.length] : first;
}
