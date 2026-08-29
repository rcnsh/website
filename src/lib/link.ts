import { isStalled, reconnectDelay } from "./cursors.ts";

/**
 * The connection half of the cursor engine: one socket, kept up.
 *
 * multiplayer.ts had all of this inline, and it is the part that went wrong
 * twice — once knocking at a room that was never coming back every fifteen
 * seconds for the rest of the session, once telling the reader they were
 * connected while the socket was shut. Both were small mistakes in state that
 * could not be run outside a browser, so neither surfaced until somebody
 * happened to be watching the right corner of the screen.
 *
 * So the machine lives here instead, and the two things it needs from the
 * outside world are handed to it: how to open a socket, and how to wait.
 * Nothing below mentions the DOM, a WebSocket or a timer, which is the whole
 * reason the thing can be checked.
 *
 * The timing itself — how long to wait, when the waiting is worth admitting to
 * — stays next door in cursors.ts with the rest of the arithmetic, where it
 * was already pinned by tests.
 */

/**
 * WebSocket's "open" readyState, written out rather than read off the global.
 * Node has a WebSocket of its own now, so `WebSocket.OPEN` would even resolve
 * under the tests — which is a worse dependency to carry than a named number.
 */
const OPEN = 1;

/** As much of a WebSocket as any of this touches. */
export interface Socket {
  readyState: number;
  send(data: string): void;
  close(): void;
}

/**
 * How a socket reports back.
 *
 * The link makes a fresh set of these per attempt and the caller wires them to
 * whatever a socket is on its platform. Nothing here knows what an event is.
 */
export interface LinkHandlers {
  opened(): void;
  received(data: string): void;
  /** Closed, failed, or refused — the link does not distinguish. */
  gone(): void;
}

export interface LinkOptions {
  /**
   * Opens a socket and wires it to `handlers`. Called once per attempt, and
   * never while one is already up.
   *
   * The handlers fire after it returns: a real socket cannot dispatch an event
   * synchronously, and a stand-in must not either.
   */
  open(handlers: LinkHandlers): Socket;
  /** Waits `ms`, then calls `fn`. Returns a function that cancels the wait. */
  wait(ms: number, fn: () => void): () => void;
  /** The socket is up. */
  onOpen?(): void;
  onMessage?(data: string): void;
  /** The socket is down, however it got that way. */
  onClose?(): void;
  /** `live` or `stalled` may have changed. */
  onState?(): void;
}

export interface Link {
  /** Whether there is an open socket right now. */
  readonly live: boolean;
  /**
   * Whether reconnecting has failed often enough to be worth admitting to.
   * The link has not given up — it is just trying slowly now.
   */
  readonly stalled: boolean;
  /** Sends on the open socket. Does nothing when there is not one. */
  send(data: string): void;
  /**
   * Hangs up on purpose, and stays down. Nothing but `wake` brings it back,
   * so this is the one for a connection that is costing more than it is worth
   * — an open tab nobody is looking at.
   */
  sleep(): void;
  /** A sign of life. Reconnects, but only from `sleep`. */
  wake(): void;
  /**
   * Connect now, from the bottom of the backoff.
   *
   * For anything suggesting conditions have plausibly changed — the tab coming
   * back, the reader moving to another page. A stalled session should not sit
   * out the rest of a five-minute wait when there is fresh evidence that it
   * might work.
   */
  revive(): void;
  /**
   * Puts the socket down without arranging to come back. Unlike `sleep` a wake
   * signal will not revive it; the caller is expected to say when.
   */
  drop(): void;
  /** Permanent. Nothing opens another socket after this. */
  destroy(): void;
}

export function link(options: LinkOptions): Link {
  let socket: Socket | null = null;
  let attempt = 0;
  let cancelWait: (() => void) | null = null;
  let asleep = false;
  let done = false;

  /**
   * Which attempt the live handlers belong to.
   *
   * A socket does not stop talking because we have stopped listening. A real
   * one reports `error` and then `close` for a single failure, and one we
   * closed ourselves still reports the close afterwards. Handlers carry the
   * number they were made under and say nothing once it has moved on, so a
   * connection we are finished with can neither schedule a reconnect nor
   * clear a live one.
   */
  let generation = 0;

  function connect() {
    if (done || socket) return;

    asleep = false;
    const mine = ++generation;

    socket = options.open({
      opened() {
        if (mine !== generation) return;

        // A connection that worked is not evidence of a problem, so the next
        // failure starts the backoff from the bottom rather than from
        // wherever the last run of them left off.
        attempt = 0;
        options.onOpen?.();
        options.onState?.();
      },

      received(data) {
        if (mine !== generation) return;
        options.onMessage?.(data);
      },

      gone() {
        if (mine !== generation) return;

        generation += 1;
        socket = null;
        options.onClose?.();
        options.onState?.();
        schedule();
      },
    });
  }

  /** Queues the next attempt, further off each time they keep failing. */
  function schedule() {
    if (cancelWait !== null || done) return;

    const delay = reconnectDelay(attempt);
    attempt += 1;
    // Crossing the stall threshold is a change worth reporting.
    options.onState?.();

    cancelWait = options.wait(delay, () => {
      cancelWait = null;
      connect();
    });
  }

  function stopWaiting() {
    if (cancelWait === null) return;

    const stop = cancelWait;
    cancelWait = null;
    stop();
  }

  function drop() {
    stopWaiting();

    const going = socket;
    socket = null;
    // Nothing this socket says from here on is ours to act on, including the
    // close event that closing it is about to produce.
    generation += 1;

    if (!going) return;
    going.close();
    options.onClose?.();
    options.onState?.();
  }

  // Connecting is what a link is for; there is no state in which one exists
  // and is not trying. Sockets open asynchronously, so the caller's own
  // wiring is long since in place by the time anything arrives.
  connect();

  return {
    get live() {
      return socket !== null && socket.readyState === OPEN;
    },

    get stalled() {
      return isStalled(attempt);
    },

    send(data) {
      if (socket === null || socket.readyState !== OPEN) return;
      socket.send(data);
    },

    sleep() {
      asleep = true;
      drop();
    },

    wake() {
      if (done || socket || !asleep) return;
      connect();
    },

    revive() {
      if (done || socket) return;

      stopWaiting();
      attempt = 0;
      connect();
    },

    drop,

    destroy() {
      done = true;
      drop();
    },
  };
}
