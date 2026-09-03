import { DurableObject } from "cloudflare:workers";

/* Rates are shared with the client half. Change CURSOR_HZ there, not here. */
import {
  FLUSH_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
} from "../../../shared/multiplayer.ts";
/* Every path the site has, written by scripts/generate-rooms.ts at build. */
import { ROOMS } from "../../../shared/rooms.generated.ts";
import {
  Budget,
  clamp,
  CLOSE_SHUT,
  type Identity,
  isMove,
  MAX_PEERS,
  mint,
  originAllowed,
  roomKey,
  sessionSeed,
  type ShutReason,
} from "./protocol.ts";

/**
 * Live cursors, one Durable Object per page path.
 *
 * A separate Worker because @astrojs/cloudflare's entry exports only
 * `{ fetch }`, with nowhere to hang a Durable Object class. Routed under
 * rcn.sh so the socket is same-origin. Nothing is persisted; the SQLite
 * backend is declared only because it is the one the free plan offers.
 */

interface Env {
  ROOMS: DurableObjectNamespace<CursorRoom>;
}

/** What a socket carries across a hibernation eviction. */
type Attachment = Identity;

const KNOWN_ROOMS = new Set(ROOMS);

/** How long a presence count may be served from the edge. */
const COUNT_TTL_SECONDS = 10;

/**
 * A socket that opens only to explain why it is closing. A refused upgrade
 * would be tidier, but the browser tells the page nothing about a failed
 * handshake, so the client would reconnect all session.
 */
function shut(why: ShutReason): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];

  // accept(), not acceptWebSocket() — this one is not joining the roster.
  server.accept();
  server.send(JSON.stringify({ t: "shut", why }));
  server.close(CLOSE_SHUT, why);

  return new Response(null, { status: 101, webSocket: client });
}

export class CursorRoom extends DurableObject<Env> {
  /**
   * Latest position per peer, awaiting the next flush. In-flight only: an
   * eviction drops at most one frame. Identity lives in socket attachments,
   * which do survive.
   */
  private pending = new Map<number, [number, number]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Rolling per-socket message allowance. */
  private budget = new Budget(MAX_MESSAGES_PER_SECOND);

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // How many people are in here, for a reader who has not turned cursors on
    // — otherwise the feature only shows itself by coincidence.
    if (url.pathname.endsWith("/count")) {
      return Response.json({ peers: this.ctx.getWebSockets().length });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PEERS) return shut("full");

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // The reader's session token, if any. It buys only cursor continuity.
    const identity = mint(
      this.peers(),
      Math.random,
      sessionSeed(url.searchParams.get("id")),
    );

    // acceptWebSocket, not accept() — the hibernatable form. Duration billing
    // is the real cost here.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(identity satisfies Attachment);

    // peers() now includes this socket, so filter it out of its own roster.
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
    if (!identity) return;

    /* Over budget: hang up rather than drop the frame. Reaching this handler
       is already billed, so ignoring the excess saves nothing — closing is the
       only lever that stops a flooder. An honest client never gets here. */
    if (!this.budget.spend(identity.id, Date.now())) {
      this.budget.forget(identity.id);
      try {
        // Said out loud first — a bare close reads as a network failure, and
        // the client would reconnect into the same wall all session.
        ws.send(JSON.stringify({ t: "shut", why: "flood" satisfies ShutReason }));
        ws.close(CLOSE_SHUT, "flood");
      } catch {
        // Already going down; webSocketClose will tidy up either way.
      }
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (!isMove(parsed)) return;

    // x is a fraction of the content column, y is pixels below its top. The
    // clamp allows the margins but not three screens off to the side.
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

    // Nobody to fan out to. An honest client stops sending when alone.
    if (this.ctx.getWebSockets().length <= 1) {
      this.pending.clear();
      return;
    }

    const frame = JSON.stringify({
      t: "f",
      // [id, x, y]. Four decimals of a column fraction is already sub-pixel.
      p: [...this.pending].map(([id, [x, y]]) => [
        id,
        Math.round(x * 1e4) / 1e4,
        Math.round(y * 10) / 10,
      ]),
    });
    this.pending.clear();

    // One serialization for the whole room; each client drops its own id.
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

/**
 * The presence count, cached at the edge. Every miss is a billed Durable
 * Object request, so ten seconds buys a handful of readers one between them
 * while "someone is here" is still news.
 */
async function presenceCount(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  room: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  /* caches.open(), not caches.default — the DOM lib's CacheStorage type, which
     tsconfig also pulls in, has no `default`. */
  const cache = await caches.open("multiplayer-presence");
  let response = await cache.match(request);

  if (!response) {
    const counted = await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);

    response = new Response(counted.body, counted);
    response.headers.set("Cache-Control", `public, max-age=${COUNT_TTL_SECONDS}`);
    response.headers.set("Content-Type", "application/json");

    ctx.waitUntil(cache.put(request, response.clone()));
  }

  return allowOrigin(response, request);
}

/**
 * Only matters in development, where the site is on :4321 and this on :8788.
 * Echoed rather than wildcarded because the header takes one origin, and
 * originAllowed() has already vetted it. `Vary` because the copy is cached.
 */
function allowOrigin(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  if (!origin) return response;

  const allowed = new Response(response.body, response);
  allowed.headers.set("Access-Control-Allow-Origin", origin);
  allowed.headers.set("Vary", "Origin");
  return allowed;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const wantsSocket = request.headers.get("Upgrade") === "websocket";

    if (!originAllowed(request.headers.get("Origin"))) {
      return new Response("Forbidden", { status: 403 });
    }

    const counting = url.pathname === "/api/multiplayer/count";
    if (!counting && url.pathname !== "/api/multiplayer") {
      return new Response("Not found", { status: 404 });
    }

    // A page the site actually has, not merely a plausible path — otherwise a
    // stranger conjures Durable Objects by asking for them.
    const room = roomKey(url.searchParams.get("room"), KNOWN_ROOMS);
    if (!room) {
      // Down the socket where there is one, so the reader is told rather than
      // left watching a reconnect loop.
      if (wantsSocket) return shut("unknown");
      return new Response("Bad room", { status: 400 });
    }

    if (counting) return presenceCount(request, env, ctx, room);

    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
