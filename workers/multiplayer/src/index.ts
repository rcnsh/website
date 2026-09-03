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
/*
  Every path this site has, written at build time by scripts/generate-rooms.ts.
  A room key that is not on it is not a page, and gets no Durable Object.
*/
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

const KNOWN_ROOMS = new Set(ROOMS);

/** How long a presence count may be served from the edge. */
const COUNT_TTL_SECONDS = 10;

/**
 * A socket that opens only to explain why it is closing.
 *
 * A refused upgrade would be tidier, but a browser does not tell its page what
 * status a failed handshake came back with — the client sees "the connection
 * did not happen", which is what it also sees when the Worker is down, so it
 * backs off and knocks all session at a room that answered it perfectly
 * clearly the first time. One word down an open socket is a thing the client
 * can act on.
 */
function shut(why: ShutReason): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];

  // accept(), not acceptWebSocket(): this one is closing immediately and has
  // no business in the room's roster or in anybody's hibernation accounting.
  server.accept();
  server.send(JSON.stringify({ t: "shut", why }));
  server.close(CLOSE_SHUT, why);

  return new Response(null, { status: 101, webSocket: client });
}

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
    const url = new URL(request.url);

    /*
      How many people are in here, for a reader who has not turned cursors on.
      The feature is invisible until two people independently switch it on over
      the same paragraph at the same moment, which is a thing that essentially
      never happens — so the first honest thing it can do is say whether there
      would be anyone to see.

      One request, edge-cached, against a socket held open for minutes.
    */
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

    // The reader's own session token, if they sent one. It buys nothing but
    // the same cursor they had a moment ago — see mint().
    const identity = mint(
      this.peers(),
      Math.random,
      sessionSeed(url.searchParams.get("id")),
    );

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
    if (!identity) return;

    /*
      Over budget: hang up rather than drop the frame.

      Reaching this handler at all is the billed event — the runtime charges a
      Durable Object request for every inbound WebSocket message, before any of
      this runs. So ignoring the excess costs exactly as much as acting on it,
      and a client that ignores the send cap would go on being charged for as
      long as it cared to keep sending. Closing the socket is the only lever
      here that ends that, and it puts a flooder on the reconnect path, which
      is one request rather than a hundred a second.

      An honest client cannot get here: the allowance is half again over the
      rate the client paces itself at.
    */
    if (!this.budget.spend(identity.id, Date.now())) {
      this.budget.forget(identity.id);
      try {
        // Said out loud first, for the same reason a refused handshake is:
        // a bare close leaves the client unable to tell "you were hung up on"
        // from "the network went away", and it would reconnect into the same
        // wall all session. One frame buys a client that knows to stop.
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

    /*
      Nobody to fan out to. The client stops sending when it is alone in a room
      for exactly this reason, so reaching here means a client that is not
      doing that — but the position is still worth dropping rather than
      serialising and handing back to the one person who already knows it.
    */
    if (this.ctx.getWebSockets().length <= 1) {
      this.pending.clear();
      return;
    }

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

/**
 * The presence count, cached at the edge.
 *
 * Every miss is a Durable Object request, and a room is brought into existence
 * by being asked about — so this is deliberately the cheapest question the
 * feature knows how to answer, and it is only asked about pages that exist.
 * Ten seconds is long enough that a page being read by a handful of people
 * costs one request between them, and short enough that "someone is here" is
 * still news.
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

  /*
    caches.open() rather than caches.default: the site's tsconfig pulls in the
    DOM lib alongside the Worker types, and only one of the two CacheStorages
    knows about `default`. A named cache is the same thing under a name, and
    the same name every time is what makes it one cache.
  */
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
 * In production this Worker answers on a route under rcn.sh and the page
 * asking is on rcn.sh, so none of this signifies. Under `npm run dev` the site
 * is on :4321 and this is on :8788 — two origins, and a plain fetch between
 * them is refused by the browser before the page ever sees the number.
 *
 * The socket does not care, which is exactly what made this easy to miss: the
 * feature worked in development and its presence count quietly read zero.
 *
 * Echoed rather than wildcarded because the header is allowed to say only one
 * origin, and originAllowed() upstream has already decided this is one of
 * ours. Nothing here is credentialed and the answer is a single integer about
 * a public page. `Vary` because the cached copy is shared between them.
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

    /*
      Not merely a plausible path — a page this site actually has. Anything
      else would be a room conjured into being by asking for it, which is the
      one thing an unauthenticated socket must not be able to do at will.
    */
    const room = roomKey(url.searchParams.get("room"), KNOWN_ROOMS);
    if (!room) {
      // Said down the socket where there is one, so a reader on a page with no
      // room is told that rather than left watching a reconnect loop.
      if (wantsSocket) return shut("unknown");
      return new Response("Bad room", { status: 400 });
    }

    if (counting) return presenceCount(request, env, ctx, room);

    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
