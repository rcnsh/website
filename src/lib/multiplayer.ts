/**
 * Live cursors — the client half of workers/multiplayer.
 *
 * This module is only ever reached through a dynamic import, from the settings
 * menu, the first time someone turns multiplayer on. Nothing here — not the
 * socket, not the render loop, not even the stylesheet, which is injected from
 * JS rather than sitting in global.css — costs anything to a visitor who never
 * touches the toggle. That is the whole point of the feature being opt-in, and
 * it is easy to give away by accident, so keep imports out of the eager path.
 */

import { SEND_INTERVAL_MS } from "../../shared/multiplayer.ts";
import { approach, type Column, onScreen, toColumn, toScreen } from "./cursors.ts";
import { link } from "./link.ts";
import { motionReduced } from "./prefs.ts";

/**
 * Whether this device has a pointer worth broadcasting.
 *
 * `any-pointer: fine` is true when *some* attached pointer is precise — a
 * mouse, trackpad or stylus. A phone is false; a laptop with a touchscreen and
 * a tablet with a keyboard case are both true, which is the right answer for
 * each of them.
 *
 * A device that fails this still connects and still draws everyone else. It
 * simply never sends: there is no cursor on a phone to broadcast, and the last
 * place a finger touched is not one. Matched live rather than read once,
 * because a mouse can be plugged into a tablet halfway through a session.
 */
const FINE_POINTER = "(any-pointer: fine)";

/*
  The send rate lives in shared/multiplayer.ts, because the Worker has to agree
  with it — see the note there. Change CURSOR_HZ, not these.
*/

/** Room membership is per page path — see the note on roomKey in the Worker. */
const ENDPOINT = import.meta.env.DEV
  ? "ws://localhost:8788/api/multiplayer"
  : `wss://${location.host}/api/multiplayer`;

/** Below this, the pointer has not really moved. In CSS pixels. */
const MOVE_EPSILON = 0.75;

/**
 * A tab left open on a monitor overnight is the expensive case, so the socket
 * is dropped and picked back up on the next movement.
 *
 * Deliberately not shortened for someone alone in a room, tempting as that
 * looks. The room is hibernatable and this client says nothing while it is
 * alone, so a solo socket costs approximately nothing to hold — and holding it
 * is the entire mechanism by which anyone finds out that somebody else has
 * arrived. Dropping it early would save nothing and cost the feature.
 */
const IDLE_MS = 4 * 60 * 1000;

/** Where the reader's session token is kept. See `token`. */
const TOKEN_KEY = "rcn:mp-session";

/** Why the room hung up on us, when it did so on purpose. */
type Refusal = "full" | "unknown";

/**
 * A stable, opaque name for this tab, minted once and kept for the session.
 *
 * Identity is assigned by the room, and it used to be assigned per socket —
 * which meant a new colour and a new animal after every idle drop, every tab
 * switch and every navigation. One person reading three posts looked like
 * three people coming and going. The room seeds the choice off this instead.
 *
 * sessionStorage rather than localStorage on purpose: two tabs on the same
 * page are two cursors, and they should not both be the amber fox. Private
 * browsing throws, in which case the room mints at random as it always did.
 */
function token(): string | null {
  try {
    const existing = sessionStorage.getItem(TOKEN_KEY);
    if (existing) return existing;

    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const minted = [...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    sessionStorage.setItem(TOKEN_KEY, minted);
    return minted;
  } catch {
    return null;
  }
}

/** A peer's identity, as the room assigns it. */
interface Identity {
  id: number;
  name: string;
  colour: string;
}

interface Peer extends Identity {
  el: HTMLElement;
  /**
   * Where the peer is, in the sender's content-column space. Null until they
   * have sent a position, which is not the same as being in the room: a phone
   * joins to watch and never sends one, and a reader who has not moved the
   * mouse yet has not sent one either. Neither has a cursor worth drawing.
   */
  target: { x: number; y: number } | null;
  /** Where we are drawing them — chases `target`. */
  drawn: { x: number; y: number } | null;
}

/** What the settings panel needs to describe the feature honestly. */
export interface SessionState {
  /** Whether the socket is actually open right now. */
  live: boolean;
  /** Other people in the room. Only meaningful while `live`. */
  peers: number;
  /**
   * Reconnecting has failed often enough to be worth admitting to. The session
   * has not given up — it is just trying slowly now.
   */
  stalled: boolean;
  /**
   * The room said no, and why. Not a failure and not worth retrying — a full
   * room and a page with no room both stay that way until something changes,
   * and the reader is owed the actual reason rather than a spinner.
   */
  refused: Refusal | null;
}

export interface Session {
  /** Point the session at a different page. No-op if it is already there. */
  setRoom(path: string): void;
  /**
   * Watch the room. One listener, replaced on each call rather than added to —
   * the settings markup is rebuilt on every navigation, and a list here would
   * accumulate closures over detached nodes for the life of the session.
   *
   * Reports connection state and not just a count, because the two are not the
   * same thing and reporting only the count made a dropped socket look exactly
   * like an empty room.
   */
  onState(listener: (state: SessionState) => void): void;
  destroy(): void;
}

/**
 * Cursors are exchanged in the coordinate space of the content column, not the
 * viewport: x as a fraction of the column's width, y as pixels below its top.
 *
 * Viewport fractions would be simpler and wrong — two people on the same page
 * at different window widths would see each other pointing at different
 * paragraphs, which makes the whole thing meaningless. The column is the one
 * thing both readers have in common, so measuring against it means a cursor
 * parked on a heading lands on that heading at any width. x outside 0..1 is
 * the margins, which is why the Worker's clamp allows it.
 */
function column(): Column {
  const el = document.getElementById("content");
  if (!el) return { left: 0, top: 0, width: Math.max(1, innerWidth) };

  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + scrollX,
    top: rect.top + scrollY,
    width: Math.max(1, rect.width),
  };
}

const CURSOR_CSS = `
.mp-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  overflow: hidden;
  contain: strict;
}
.mp-cursor {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
  will-change: transform;
  opacity: 0;
  transition: opacity 0.18s ease;
}
.mp-cursor[data-shown] { opacity: 1; }
.mp-cursor svg {
  display: block;
  width: 15px;
  height: 18px;
  flex: none;
  /* The arrow is drawn in the peer's colour; the drop shadow is what keeps it
     legible where it crosses a code block or the map. */
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.65));
}
.mp-name {
  margin-top: 11px;
  border-radius: 4px;
  padding: 1px 5px 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
  color: #0d0d0c;
  background: var(--mp-colour);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
}
/* The attribute, not the media query: the settings menu can turn motion down
   past the OS setting or back up over it, and this layer only ever exists on a
   page with script, where lib/prefs has already stamped the answer on <html>. */
:root[data-motion="reduce"] .mp-cursor { transition: none; }
`;

const ARROW = `<svg viewBox="0 0 15 18" fill="var(--mp-colour)" aria-hidden="true"><path d="M1 1.3v14.2a.6.6 0 0 0 1 .43l3.2-3.1 2.1 4.5a.9.9 0 0 0 1.7-.75l-2-4.4h4.3a.6.6 0 0 0 .43-1.03L2 .9A.6.6 0 0 0 1 1.3Z"/></svg>`;

export function start(): Session {
  /* Asked each time rather than read once at start: the switch can be flipped
     while the socket is open, and a session that outlives several navigations
     would otherwise be stuck with whatever was true when it connected. */
  const reduced = motionReduced;
  const pointer = matchMedia(FINE_POINTER);

  const style = document.createElement("style");
  style.textContent = CURSOR_CSS;
  document.head.appendChild(style);

  const layer = document.createElement("div");
  layer.className = "mp-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  const peers = new Map<number, Peer>();
  let watcher: ((state: SessionState) => void) | null = null;

  let room = path();
  let closed = false;
  /** Set when the room has told us not to bother. Cleared on every open. */
  let refused: Refusal | null = null;

  /** Latest local pointer position, in column space. Null until it moves. */
  let mine: { x: number; y: number } | null = null;
  let sent: { x: number; y: number } | null = null;
  let lastSendAt = 0;
  let lastMoveAt = performance.now();

  let frame: number | null = null;
  let lastFrameAt = 0;

  const bindings = new AbortController();
  const { signal } = bindings;

  function path() {
    return location.pathname.replace(/\/+$/, "") || "/";
  }

  function announce() {
    // A destroyed session has no business reporting anything — tearing down
    // clears the peers, and that must not read as "nobody else is here".
    if (closed) return;
    watcher?.({
      live: connection.live,
      peers: peers.size,
      stalled: connection.stalled,
      refused,
    });
  }

  // --- Connection -----------------------------------------------------------

  /*
    Everything about keeping the socket up — the backoff, what counts as a
    deliberate hang-up, which of two sockets is the live one — lives in
    link.ts, where it can be tested without a browser. What stays here is the
    half that cannot: turning a WebSocket's events into the three the link
    understands, and deciding what the rest of the engine does about each.
  */
  const connection = link({
    open(handlers) {
      const seed = token();
      const ws = new WebSocket(
        `${ENDPOINT}?room=${encodeURIComponent(room)}${seed ? `&id=${seed}` : ""}`,
      );

      ws.addEventListener("open", () => handlers.opened());
      ws.addEventListener("message", (event) => {
        if (typeof event.data === "string") handlers.received(event.data);
      });
      ws.addEventListener("close", () => handlers.gone());
      ws.addEventListener("error", () => handlers.gone());

      return ws;
    },

    wait(ms, fn) {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },

    onOpen() {
      // Whatever the pointer was doing while disconnected is the truth now.
      sent = null;
      refused = null;
      loop();
    },

    onMessage: (data) => receive(data),
    onClose: () => clearPeers(),
    onState: () => announce(),
  });

  function receive(raw: string) {
    let message: {
      t?: string;
      self?: Identity;
      peers?: Identity[];
      peer?: Identity;
      id?: number;
      why?: string;
      p?: [number, number, number][];
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    switch (message.t) {
      case "hi":
        for (const peer of message.peers ?? []) {
          if (peer.id !== message.self?.id) add(peer);
        }
        announce();
        break;

      case "join":
        if (message.peer) add(message.peer);
        announce();
        break;

      case "bye":
        if (typeof message.id === "number") remove(message.id);
        announce();
        break;

      case "f":
        for (const [id, x, y] of message.p ?? []) {
          const peer = peers.get(id);
          if (peer) peer.target = { x, y };
        }
        break;

      /*
        A deliberate no: the room is full, or this page has no room at all.
        Either way the socket that opened to say so is about to close, and
        reconnecting would get the same sentence back. Stop, and let the panel
        say which it was. A navigation or the reader coming back to the tab
        calls revive(), which is the only thing that undoes this.
      */
      case "shut":
        refused = message.why === "full" ? "full" : "unknown";
        connection.halt();
        break;
    }
  }

  // --- Peers ----------------------------------------------------------------

  function add(identity: Identity) {
    if (peers.has(identity.id)) return;

    const el = document.createElement("div");
    el.className = "mp-cursor";
    el.style.setProperty("--mp-colour", identity.colour);
    el.innerHTML = ARROW;

    const label = document.createElement("span");
    label.className = "mp-name";
    // textContent, not innerHTML — the name is server-assigned today, and this
    // is the line that keeps that from mattering if it ever isn't.
    label.textContent = identity.name;
    el.appendChild(label);

    layer.appendChild(el);
    peers.set(identity.id, {
      ...identity,
      el,
      target: null,
      drawn: null,
    });

    // Nothing has been sent while the room was empty, so `sent` describes a
    // position from before the silence — clearing it means the next frame
    // tells the new arrival where the pointer actually is rather than waiting
    // for it to move.
    sent = null;
    loop();
  }

  function remove(id: number) {
    const peer = peers.get(id);
    if (!peer) return;

    peers.delete(id);
    peer.el.removeAttribute("data-shown");
    // Let the fade finish before the node goes.
    setTimeout(() => peer.el.remove(), reduced() ? 0 : 200);
  }

  function clearPeers() {
    for (const peer of peers.values()) peer.el.remove();
    peers.clear();
    announce();
  }

  // --- Frame loop -----------------------------------------------------------

  function loop() {
    if (frame !== null) return;
    lastFrameAt = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = null;

    const dt = Math.min(100, now - lastFrameAt);
    lastFrameAt = now;

    const box = column();
    draw(box, dt);
    send(now, box);

    if (now - lastMoveAt > IDLE_MS && connection.live) connection.sleep();

    // Nothing to draw and nothing to send is a loop worth not running. The
    // pointermove listener restarts it.
    if (peers.size > 0 || connection.live) frame = requestAnimationFrame(tick);
  }

  function draw(box: Column, dt: number) {
    for (const peer of peers.values()) {
      // Being in the room is not a position. Joining used to seed one — the
      // top centre of the column — so a peer who had never sent anything was
      // drawn there anyway, with their name on it. For a reader who has not
      // reached for the mouse yet that is a blip until they do; for a phone,
      // which is in the room precisely to watch and never sends, it was
      // permanent. Both cases end here: no position, no cursor.
      if (!peer.target) continue;

      if (!peer.drawn) peer.drawn = { ...peer.target };
      else {
        // Reduced motion asks for no tween at all, which is tau = 0: land on
        // the target this frame.
        peer.drawn.x = approach(
          peer.drawn.x,
          peer.target.x,
          dt,
          reduced() ? 0 : undefined,
        );
        peer.drawn.y = approach(
          peer.drawn.y,
          peer.target.y,
          dt,
          reduced() ? 0 : undefined,
        );
      }

      const screen = toScreen(peer.drawn, box, { x: scrollX, y: scrollY });

      peer.el.style.transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px, 0)`;
      // Off-screen peers keep their state but stop being composited.
      peer.el.toggleAttribute(
        "data-shown",
        onScreen(screen, { width: innerWidth, height: innerHeight }),
      );
    }
  }

  function send(now: number, box: Column) {
    /*
      Nobody to send to.

      Every inbound message is a billed Durable Object request, and being alone
      on a page is not the edge case — on a personal site it is very nearly
      every reader, every time. Without this the commonest thing the feature
      does is pay full rate to describe a pointer to an empty room. It is also
      what lets the room hibernate, which is what makes holding the socket open
      while alone affordable in the first place.
    */
    if (peers.size === 0) return;

    // Receive-only devices never reach here with a position anyway, since the
    // handler below refuses to record one. This is the belt to that braces:
    // some mobile browsers report a stray non-touch pointermove while
    // scrolling, and one of those should not put a ghost cursor on everyone
    // else's screen.
    if (!pointer.matches) return;
    if (!mine || !connection.live) return;
    if (now - lastSendAt < SEND_INTERVAL_MS) return;

    // Resting on the page costs nothing. This is most of why an open tab is
    // affordable at all.
    if (
      sent &&
      Math.abs(mine.x - sent.x) * box.width < MOVE_EPSILON &&
      Math.abs(mine.y - sent.y) < MOVE_EPSILON
    ) {
      return;
    }

    lastSendAt = now;
    sent = { ...mine };
    connection.send(JSON.stringify({ t: "m", x: mine.x, y: mine.y }));
  }

  // --- Input ----------------------------------------------------------------

  /**
   * "Still here" — refreshes the idle timer and brings the socket back if it
   * has already been dropped.
   *
   * pointermove is that signal for anyone holding a mouse, but a phone never
   * fires one, and a reader who is only *receiving* cursors should not be cut
   * off after four minutes with no way back. So the ordinary signs of someone
   * being present count too.
   */
  function wake() {
    lastMoveAt = performance.now();
    if (!document.hidden) connection.wake();
    loop();
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      // Two gates, and they catch different things. The device check keeps
      // phones off the wire entirely; the pointerType check covers the
      // touchscreen on a laptop, which passes the device check on the strength
      // of its trackpad but should not broadcast a fingertip.
      if (!pointer.matches || event.pointerType === "touch") {
        wake();
        return;
      }

      mine = toColumn({ x: event.pageX, y: event.pageY }, column());
      wake();
    },
    { passive: true, signal },
  );

  for (const name of ["pointerdown", "touchstart", "keydown"] as const) {
    document.addEventListener(name, wake, { passive: true, signal });
  }
  // Also repositions the cursors, which are anchored to the document.
  window.addEventListener("scroll", wake, { passive: true, signal });

  document.addEventListener(
    "visibilitychange",
    () => {
      // A hidden tab cannot see cursors and rAF is paused anyway, so holding
      // the socket open would be duration billed for nothing.
      if (document.hidden) connection.drop();
      else if (!closed) {
        lastMoveAt = performance.now();
        // revive, not wake — coming back to the tab is the clearest sign that
        // a stalled session is worth retrying straight away.
        connection.revive();
      }
    },
    { signal },
  );

  return {
    setRoom(next) {
      const key = next.replace(/\/+$/, "") || "/";
      /*
        A view transition swaps both <head> and the contents of <body>, and
        takes these two with it — the stylesheet especially, which leaves the
        cursors in the document with none of the rules that position or colour
        them. Re-attaching is cheaper than persisting them through the router,
        and happens on every navigation whether or not the room changed.
      */
      if (!style.isConnected) document.head.appendChild(style);
      if (!layer.isConnected) document.body.appendChild(layer);
      if (key === room) return;

      room = key;
      mine = null;
      sent = null;
      // Whatever the last room said no about, this is a different room.
      refused = null;
      connection.drop();
      if (!document.hidden) connection.revive();
    },

    onState(listener) {
      watcher = listener;
      announce();
    },

    destroy() {
      closed = true;
      bindings.abort();
      connection.destroy();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      layer.remove();
      style.remove();
    },
  };
}
