/**
 * Live cursors — the client half of workers/multiplayer.
 *
 * Reached only through a dynamic import when the toggle is first switched on,
 * so it costs nothing to a visitor who never touches it. Keep it off the eager
 * path.
 */

import { SEND_INTERVAL_MS } from "../../shared/multiplayer.ts";
import { approach, type Column, onScreen, toColumn, toScreen } from "./cursors.ts";
import { link } from "./link.ts";
import { motionReduced } from "./prefs.ts";

/**
 * A pointer precise enough to broadcast. Devices that fail still connect and
 * draw everyone else, they just never send. Matched live — a mouse can be
 * plugged into a tablet mid-session.
 */
const FINE_POINTER = "(any-pointer: fine)";

/* Send rate lives in shared/multiplayer.ts so the Worker agrees. */

/** Room membership is per page path — see the note on roomKey in the Worker. */
const ENDPOINT = import.meta.env.DEV
  ? "ws://localhost:8788/api/multiplayer"
  : `wss://${location.host}/api/multiplayer`;

/** Below this, the pointer has not really moved. In CSS pixels. */
const MOVE_EPSILON = 0.75;

/**
 * Drop the socket on an idle tab, resume on the next movement. Deliberately
 * not shortened when alone — the room hibernates, and holding the socket open
 * is how you find out someone has arrived.
 */
const IDLE_MS = 4 * 60 * 1000;

/** Where the reader's session token is kept. See `token`. */
const TOKEN_KEY = "rcn:mp-session";

/** Why the room hung up on purpose. `flood` means a bug here, not a busy page. */
type Refusal = "full" | "unknown" | "flood" | "busy";

/**
 * A stable name for this tab, so the room keeps assigning the same colour and
 * animal across reconnects. sessionStorage, so two tabs differ; private
 * browsing throws and the room falls back to minting at random.
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
  /** Position in column space. Null until they send one — phones never do. */
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
  /** Reconnecting has failed enough to admit to. Still trying, just slowly. */
  stalled: boolean;
  /** The room said no, and why. Not worth retrying; say so rather than spin. */
  refused: Refusal | null;
}

export interface Session {
  /** Point the session at a different page. No-op if it is already there. */
  setRoom(path: string): void;
  /**
   * Watch the room. One listener, replaced per call — settings markup is
   * rebuilt on every navigation, so a list would leak detached closures.
   */
  onState(listener: (state: SessionState) => void): void;
  destroy(): void;
}

/**
 * The content column. Cursors are exchanged relative to it — x as a fraction
 * of its width, y as pixels below its top — so a cursor parked on a heading
 * lands on that heading at any window width. x outside 0..1 is the margins.
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
  /* Keeps the arrow legible over code blocks and the map. */
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
/* The attribute, not the media query — settings can override the OS. */
:root[data-motion="reduce"] .mp-cursor { transition: none; }
`;

const ARROW = `<svg viewBox="0 0 15 18" fill="var(--mp-colour)" aria-hidden="true"><path d="M1 1.3v14.2a.6.6 0 0 0 1 .43l3.2-3.1 2.1 4.5a.9.9 0 0 0 1.7-.75l-2-4.4h4.3a.6.6 0 0 0 .43-1.03L2 .9A.6.6 0 0 0 1 1.3Z"/></svg>`;

export function start(): Session {
  /* Read per call, not once — the switch can flip while the socket is open. */
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
    // Teardown clears peers; that must not read as "nobody else is here".
    if (closed) return;
    watcher?.({
      live: connection.live,
      peers: peers.size,
      stalled: connection.stalled,
      refused,
    });
  }

  // --- Connection -----------------------------------------------------------

  /* Reconnect policy lives in link.ts, testable without a browser. This half
     just maps WebSocket events onto it. */
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

      /* A deliberate no — reconnecting gets the same answer back. Only
         revive(), on navigation or tab focus, undoes this. */
      case "shut":
        refused =
          message.why === "full" ||
          message.why === "flood" ||
          message.why === "busy"
            ? message.why
            : "unknown";
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
    // textContent, not innerHTML: names are server-assigned, keep it moot.
    label.textContent = identity.name;
    el.appendChild(label);

    layer.appendChild(el);
    peers.set(identity.id, {
      ...identity,
      el,
      target: null,
      drawn: null,
    });

    // `sent` predates the silence, so clear it and let the arrival get a
    // position without waiting for the pointer to move.
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

    // Nothing to draw or send. The pointermove listener restarts it.
    if (peers.size > 0 || connection.live) frame = requestAnimationFrame(tick);
  }

  function draw(box: Column, dt: number) {
    for (const peer of peers.values()) {
      // Being in the room is not a position. No position, no cursor.
      if (!peer.target) continue;

      if (!peer.drawn) peer.drawn = { ...peer.target };
      else {
        // Reduced motion is tau = 0: land on the target this frame.
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
    // Nobody to send to. Every message is a billed DO request and being alone
    // is the common case; this is also what lets the room hibernate.
    if (peers.size === 0) return;

    // Belt to the handler's braces: some mobile browsers fire a stray
    // non-touch pointermove while scrolling.
    if (!pointer.matches) return;
    if (!mine || !connection.live) return;
    if (now - lastSendAt < SEND_INTERVAL_MS) return;

    // Resting on the page costs nothing.
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
   * "Still here" — refreshes the idle timer and revives a dropped socket. Bound
   * to more than pointermove, since a phone never fires one.
   */
  function wake() {
    lastMoveAt = performance.now();
    if (!document.hidden) connection.wake();
    loop();
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      // Device check keeps phones off the wire; pointerType covers the
      // touchscreen on a laptop that passed it on the strength of its trackpad.
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
      // A hidden tab cannot see cursors and rAF is paused anyway.
      if (document.hidden) connection.drop();
      else if (!closed) {
        lastMoveAt = performance.now();
        // revive, not wake — returning to the tab is worth an instant retry.
        connection.revive();
      }
    },
    { signal },
  );

  return {
    setRoom(next) {
      const key = next.replace(/\/+$/, "") || "/";
      /* A view transition replaces <head> and the contents of <body>, taking
         these with it. Cheaper to re-attach than to persist them. */
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
