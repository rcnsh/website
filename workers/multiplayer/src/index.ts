import { DurableObject } from "cloudflare:workers";

/*
  Rates come from shared/multiplayer.ts, which the client half imports too —
  the two have to agree, and keeping the numbers in both files meant three
  edits to change one thing. Change CURSOR_HZ there, not these.
*/
import {
  FLUSH_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
} from "../../../shared/multiplayer.ts";
import {
  Budget,
  clamp,
  type Identity,
  isMove,
  MAX_PEERS,
  mint,
  originAllowed,
  roomKey,
} from "./protocol.ts";

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

  /** Rolling per-socket message allowance. */
  private budget = new Budget(MAX_MESSAGES_PER_SECOND);

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

    const identity = mint(this.peers());

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
    if (!identity || !this.budget.spend(identity.id, Date.now())) return;

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
    this.budget.forget(identity.id);
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
