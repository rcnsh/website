import { DurableObject } from "cloudflare:workers";

/*
  Rates come from shared/multiplayer.ts, which the client half imports too —
  the two have to agree, and keeping the numbers in both files meant three
  edits to change one thing. Change CURSOR_HZ there, not these.
*/
import {
  FLUSH_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
} from "../../../shared/multiplayer";

/**
 * Live cursors, one Durable Object per page path.
 *
 * This is a separate Worker from the site because @astrojs/cloudflare builds
 * its entry from `@astrojs/cloudflare/entrypoints/server`, which exports only
 * `{ fetch }` — there is nowhere to hang a Durable Object class off. It runs on
 * a route under rcn.sh rather than its own hostname, so the browser opens the
 * socket same-origin and the site's CSP needs no new entry.
 *
 * Nothing is persisted. The SQLite storage backend is declared because it is
 * the only one available on the Workers Free plan, not because it is used.
 */

interface Env {
  ROOMS: DurableObjectNamespace<CursorRoom>;
}

/** Beyond this the screen is soup, and the fan-out stops being cheap. */
const MAX_PEERS = 20;

/*
  Deliberately wider than the site's palette, which is one accent on warm
  grey — remote cursors have to be told apart at a glance, and they should not
  read as site chrome. Held at roughly even lightness so no one gets a cursor
  that disappears against #0d0d0c, and each is named by its colour so the
  label explains the arrow it is attached to.
*/
const COLOURS: ReadonlyArray<readonly [name: string, hex: string]> = [
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

const ANIMALS = [
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

interface Identity {
  id: number;
  name: string;
  colour: string;
}

/** What a socket carries across a hibernation eviction. */
type Attachment = Identity;

export class CursorRoom extends DurableObject<Env> {
  /**
   * Latest position per peer, awaiting the next flush. Purely in-flight — a
   * hibernation eviction between messages drops at most one frame, and the
   * next message rebuilds it. Identity never lives here; it is read back from
   * each socket's attachment, which does survive eviction.
   */
  private pending = new Map<number, [number, number]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Rolling per-socket message budget, keyed by identity id. */
  private budget = new Map<number, { until: number; count: number }>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PEERS) {
      // 1013 "try again later" — the room is full, not the client's fault.
      return new Response("Room full", { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const identity = this.mint(this.peers());

    // acceptWebSocket, not accept() — the hibernatable form. Duration billing
    // is the real cost of this feature, and an idle room that has not been
    // evicted is duration nobody is getting anything for.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(identity satisfies Attachment);

    // peers() reads back from the attachments, which now includes this socket,
    // so the new arrival is filtered out of its own roster.
    server.send(
      JSON.stringify({
        t: "hi",
        self: identity,
        peers: this.peers().filter((peer) => peer.id !== identity.id),
      }),
    );
    this.broadcast(JSON.stringify({ t: "join", peer: identity }), identity.id);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string" || message.length > 256) return;

    const identity = this.identityOf(ws);
    if (!identity || !this.spend(identity.id)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (!isMove(parsed)) return;

    // x is a fraction of the reader's content column, y is pixels down from
    // its top — see src/lib/multiplayer.ts for why. Clamping x keeps a cursor
    // that has wandered into the margins visible without letting a hostile
    // client park one three screens off to the side.
    this.pending.set(identity.id, [
      clamp(parsed.x, -1.5, 2.5),
      clamp(parsed.y, -1e5, 1e6),
    ]);

    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.drop(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.drop(ws);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pending.size === 0) return;

    const frame = JSON.stringify({
      t: "f",
      // [id, x, y]. Rounded because four decimals of a column fraction is
      // sub-pixel on any screen, and the tenth of a pixel below that is noise
      // paid for on every tick.
      p: [...this.pending].map(([id, [x, y]]) => [
        id,
        Math.round(x * 1e4) / 1e4,
        Math.round(y * 10) / 10,
      ]),
    });
    this.pending.clear();

    // Sent to everyone including the peers in it; each client drops its own
    // id. One serialization for the whole room beats one per recipient.
    this.broadcast(frame);
  }

  private drop(ws: WebSocket): void {
    const identity = this.identityOf(ws);
    if (!identity) return;

    this.pending.delete(identity.id);
    this.budget.delete(identity.id);
    this.broadcast(JSON.stringify({ t: "bye", id: identity.id }), identity.id);
  }

  private broadcast(payload: string, except?: number): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (except !== undefined && this.identityOf(socket)?.id === except) continue;
      try {
        socket.send(payload);
      } catch {
        // Closing mid-broadcast is ordinary; webSocketClose will tidy up.
      }
    }
  }

  private peers(): Identity[] {
    return this.ctx
      .getWebSockets()
      .map((socket) => this.identityOf(socket))
      .filter((identity): identity is Identity => identity !== null);
  }

  private identityOf(ws: WebSocket): Identity | null {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    return attachment ?? null;
  }

  /**
   * A colour nobody in the room is already using, where possible, so two
   * people are never both "the blue one". Falls back to any colour once the
   * room is bigger than the palette.
   */
  private mint(taken: Identity[]): Identity {
    const usedColours = new Set(taken.map((peer) => peer.colour));
    const usedIds = new Set(taken.map((peer) => peer.id));

    const free = COLOURS.filter(([, hex]) => !usedColours.has(hex));
    const [word, colour] = pick(free.length > 0 ? free : COLOURS);

    let id = 0;
    do {
      // Ids are per-room and short-lived; 24 bits is far past collision risk
      // at MAX_PEERS, and the loop covers the rest.
      id = 1 + Math.floor(Math.random() * 0xff_ff_ff);
    } while (usedIds.has(id));

    return { id, name: `${word} ${pick(ANIMALS)}`, colour };
  }

  /** Returns false when this peer has already spent its second. */
  private spend(id: number): boolean {
    const now = Date.now();
    const window = this.budget.get(id);

    if (!window || now >= window.until) {
      this.budget.set(id, { until: now + 1000, count: 1 });
      return true;
    }

    window.count += 1;
    return window.count <= MAX_MESSAGES_PER_SECOND;
  }
}

function isMove(value: unknown): value is { x: number; y: number } {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Rooms are keyed by page path, so the cursor you see is pointing at the same
 * paragraph you are looking at. Normalised hard — a room is an identifier,
 * and `/blog/x`, `/blog/x/` and `/blog/X` should not be three of them.
 */
function roomKey(raw: string | null): string | null {
  if (!raw) return null;

  const path = raw.toLowerCase().replace(/\/+$/, "") || "/";
  if (path.length > 128 || !/^\/[a-z0-9\-._/]*$/.test(path)) return null;

  return path;
}

/**
 * Same-origin only. The socket is unauthenticated and costs Durable Object
 * duration to hold open, so it is not something to leave open to any page on
 * the internet that fancies a free realtime backend.
 */
function originAllowed(origin: string | null): boolean {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/multiplayer") {
      return new Response("Not found", { status: 404 });
    }
    if (!originAllowed(request.headers.get("Origin"))) {
      return new Response("Forbidden", { status: 403 });
    }

    const room = roomKey(url.searchParams.get("room"));
    if (!room) return new Response("Bad room", { status: 400 });

    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
