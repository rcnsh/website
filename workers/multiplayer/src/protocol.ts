/**
 * Everything the room decides that does not need a Durable Object to decide it.
 * Split from index.ts so it can be tested outside workerd.
 */

export interface Identity {
  id: number;
  name: string;
  colour: string;
}

/** Beyond this the screen is soup, and the fan-out stops being cheap. */
export const MAX_PEERS = 20;

/**
 * Why a room hung up on purpose. Sent over an open socket rather than by
 * refusing the upgrade, which the browser cannot tell from a dead server.
 * `flood` is aimed at a misbehaving client — see Budget. `busy` is the
 * upgrade budget in index.ts, and unlike the others it clears on its own.
 */
export type ShutReason = "full" | "unknown" | "flood" | "busy";

/** Application close codes start at 4000; anything below is the protocol's. */
export const CLOSE_SHUT = 4001;

/* Wider than the site palette — cursors must be told apart at a glance and
   not read as chrome. Even lightness, so none vanish against #0d0d0c. */
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
 * Whether a parsed message is a position update. The socket is
 * unauthenticated, so this is the only guard on the room's state. Finite
 * specifically: NaN would poison every later interpolated frame.
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
 * Rooms are keyed by page path, normalised hard so `/blog/x`, `/blog/x/` and
 * `/blog/X` are one room. Returns null for anything that is not a page here.
 *
 * `known` is the build-time path list (shared/rooms.generated.ts), and it is
 * load-bearing: each distinct key spawns a Durable Object on request, and the
 * shape checks alone would pass every spelling a script cares to try. Omitted
 * by the generator itself, which only needs the normalisation.
 */
export function roomKey(
  raw: string | null,
  known?: ReadonlySet<string>,
): string | null {
  if (!raw) return null;

  // Doubled slashes collapse rather than reject: //blog/x is the same page.
  const path =
    raw
      .toLowerCase()
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/, "") || "/";
  if (path.length > 128 || !/^\/[a-z0-9\-._/]*$/.test(path)) return null;

  // `.` is fine inside a segment (/blog/a-post.v2); an all-dots segment is a
  // relative step, and two spellings of one page would be two rooms.
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  if (known && !known.has(path)) return null;

  return path;
}

/** Same-origin only — the socket is unauthenticated and billed by duration. */
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
 * Per-socket message allowance in a rolling one-second window.
 *
 * The inbound request is already billed by the time this runs, so exceeding
 * the budget closes the socket rather than dropping the frame — hanging up is
 * the only thing that stops the meter. The allowance is half again over the
 * client's own send rate, so an honest one never trips it.
 */
export class Budget {
  private windows = new Map<number, { until: number; count: number }>();
  private readonly perSecond: number;

  // Longhand, not a parameter property: Node's test runner strips types
  // rather than compiling them.
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
 * An opaque client-supplied token, or null. Untrusted — it only picks a colour
 * and an animal — but bounded, since it gets hashed.
 */
export function sessionSeed(raw: string | null): string | null {
  if (!raw) return null;
  return /^[a-z0-9]{1,64}$/i.test(raw) ? raw : null;
}

/** FNV-1a, 32-bit. Not security — just a stable token to identity mapping. */
function hash(text: string): number {
  let value = 0x81_1c_9d_c5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01_00_01_93);
  }
  return value >>> 0;
}

/**
 * An identity, preferring a colour nobody in the room has. Falls back to the
 * whole palette once the room outgrows it; `random` is injected so tests can
 * pin the choice.
 *
 * `seed` is the caller's session token, and keeps one reader from looking like
 * a crowd across reconnects. The animal comes from it and nothing else; the
 * colour is only preferred, since telling two cursors apart wins.
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

  /* 24 bits is well past collision risk at MAX_PEERS. Retries are bounded
     with a fallback that cannot fail — a loop here would wedge the room. */
  let id = 0;
  if (seeded !== null) {
    // Same reader, same id, so a reconnect reads as one person moving.
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
