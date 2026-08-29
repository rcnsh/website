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

/** Room membership is per page path — see the note on roomKey in the Worker. */
const ENDPOINT = import.meta.env.DEV
  ? "ws://localhost:8788/api/multiplayer"
  : `wss://${location.host}/api/multiplayer`;

/**
 * Target send rate, in hertz. Every inbound message is a billed Durable Object
 * request, so this is the single number that decides what the feature costs:
 * one sender holding a tab open at 60 Hz is roughly 5.2M requests a day
 * against a 1M/day free-tier allowance. Turn it down before anything else if
 * that starts to bite.
 */
const SEND_HZ = 60;

/**
 * The floor between two sends, with a few milliseconds of slack.
 *
 * Sending is frame-paced, and a bare 1000/60 would sit exactly on a 60 Hz
 * display's frame interval — a millisecond of scheduling jitter would push a
 * frame under the threshold and halve the rate to 30 Hz, visibly. The slack
 * absorbs that. It does mean a 144 Hz display lands nearer 72 Hz than 60,
 * which is what the Worker's per-socket budget leaves headroom for.
 */
const SEND_MS = 1000 / SEND_HZ - 3;

/** Below this, the pointer has not really moved. In CSS pixels. */
const MOVE_EPSILON = 0.75;

/**
 * A held-open socket bills Durable Object duration for as long as it is open,
 * whether or not anyone is moving. A tab left on a monitor overnight is the
 * expensive case, so it drops the connection and picks it back up on the next
 * movement.
 */
const IDLE_MS = 4 * 60 * 1000;

/**
 * Time constant for the position smoothing. Roughly one send interval — at
 * 60 Hz there is far less gap to hide than at 20, so a long tail here would
 * read as lag rather than as smoothing.
 */
const SMOOTH_TAU = 25;

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15_000;

interface Identity {
  id: number;
  name: string;
  colour: string;
}

interface Peer extends Identity {
  el: HTMLElement;
  /** Where the peer is, in the sender's content-column space. */
  target: { x: number; y: number };
  /** Where we are drawing them — chases `target`. */
  drawn: { x: number; y: number } | null;
}

export interface Session {
  /** Point the session at a different page. No-op if it is already there. */
  setRoom(path: string): void;
  /**
   * Watch how many other people are in the room. One listener, replaced on
   * each call rather than added to — the settings markup is rebuilt on every
   * navigation, and a list here would accumulate closures over detached nodes
   * for the life of the session.
   */
  onPresence(listener: (count: number) => void): void;
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
function column() {
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
@media (prefers-reduced-motion: reduce) {
  .mp-cursor { transition: none; }
}
`;

const ARROW = `<svg viewBox="0 0 15 18" fill="var(--mp-colour)" aria-hidden="true"><path d="M1 1.3v14.2a.6.6 0 0 0 1 .43l3.2-3.1 2.1 4.5a.9.9 0 0 0 1.7-.75l-2-4.4h4.3a.6.6 0 0 0 .43-1.03L2 .9A.6.6 0 0 0 1 1.3Z"/></svg>`;

export function start(): Session {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = matchMedia(FINE_POINTER);

  const style = document.createElement("style");
  style.textContent = CURSOR_CSS;
  document.head.appendChild(style);

  const layer = document.createElement("div");
  layer.className = "mp-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  const peers = new Map<number, Peer>();
  let presence: ((count: number) => void) | null = null;

  let room = path();
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  /** Latest local pointer position, in column space. Null until it moves. */
  let mine: { x: number; y: number } | null = null;
  let sent: { x: number; y: number } | null = null;
  let lastSendAt = 0;
  let lastMoveAt = performance.now();
  let idle = false;

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
    presence?.(peers.size);
  }

  // --- Connection -----------------------------------------------------------

  function connect() {
    if (closed || socket) return;

    idle = false;
    const ws = new WebSocket(`${ENDPOINT}?room=${encodeURIComponent(room)}`);
    socket = ws;

    ws.addEventListener("open", () => {
      attempt = 0;
      // Whatever the pointer was doing while disconnected is the truth now.
      sent = null;
      loop();
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") receive(event.data);
    });

    const gone = () => {
      if (socket !== ws) return;
      socket = null;
      clearPeers();
      // An idle disconnection is deliberate; movement brings it back.
      if (!closed && !idle) schedule();
    };

    ws.addEventListener("close", gone);
    ws.addEventListener("error", gone);
  }

  function schedule() {
    if (retry !== null || closed) return;

    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);
    attempt += 1;
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, delay);
  }

  function disconnect() {
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    const ws = socket;
    socket = null;
    ws?.close();
    clearPeers();
  }

  function receive(raw: string) {
    let message: {
      t?: string;
      self?: Identity;
      peers?: Identity[];
      peer?: Identity;
      id?: number;
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
      target: { x: 0.5, y: 0 },
      drawn: null,
    });
    loop();
  }

  function remove(id: number) {
    const peer = peers.get(id);
    if (!peer) return;

    peers.delete(id);
    peer.el.removeAttribute("data-shown");
    // Let the fade finish before the node goes.
    setTimeout(() => peer.el.remove(), reduced ? 0 : 200);
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

    if (now - lastMoveAt > IDLE_MS && socket) {
      idle = true;
      disconnect();
    }

    // Nothing to draw and nothing to send is a loop worth not running. The
    // pointermove listener restarts it.
    if (peers.size > 0 || socket) frame = requestAnimationFrame(tick);
  }

  function draw(box: ReturnType<typeof column>, dt: number) {
    // Exponential approach rather than a fixed step, so the smoothing holds
    // its shape on a 144 Hz screen and through a dropped frame alike.
    const alpha = reduced ? 1 : 1 - Math.exp(-dt / SMOOTH_TAU);

    for (const peer of peers.values()) {
      if (!peer.drawn) peer.drawn = { ...peer.target };
      else {
        peer.drawn.x += (peer.target.x - peer.drawn.x) * alpha;
        peer.drawn.y += (peer.target.y - peer.drawn.y) * alpha;
      }

      const x = box.left + peer.drawn.x * box.width - scrollX;
      const y = box.top + peer.drawn.y - scrollY;

      // Off-screen peers keep their state but stop being composited.
      const visible =
        x > -80 && y > -40 && x < innerWidth + 40 && y < innerHeight + 40;

      peer.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      peer.el.toggleAttribute("data-shown", visible);
    }
  }

  function send(now: number, box: ReturnType<typeof column>) {
    // Receive-only devices never reach here with a position anyway, since the
    // handler below refuses to record one. This is the belt to that braces:
    // some mobile browsers report a stray non-touch pointermove while
    // scrolling, and one of those should not put a ghost cursor on everyone
    // else's screen.
    if (!pointer.matches) return;
    if (!mine || socket?.readyState !== WebSocket.OPEN) return;
    if (now - lastSendAt < SEND_MS) return;

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
    socket.send(JSON.stringify({ t: "m", x: mine.x, y: mine.y }));
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
    if (idle && !socket && !document.hidden) connect();
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

      const box = column();
      mine = {
        x: (event.pageX - box.left) / box.width,
        y: event.pageY - box.top,
      };
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
      if (document.hidden) disconnect();
      else if (!closed) {
        lastMoveAt = performance.now();
        connect();
      }
    },
    { signal },
  );

  connect();

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
      disconnect();
      if (!document.hidden) connect();
    },

    onPresence(listener) {
      presence = listener;
      listener(peers.size);
    },

    destroy() {
      closed = true;
      bindings.abort();
      disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      layer.remove();
      style.remove();
    },
  };
}
