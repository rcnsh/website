import { isStalled, reconnectDelay } from "./cursors.ts";

/**
 * The connection half of the cursor engine: one socket, kept up. Opening and
 * waiting are injected so the state machine can be tested; the timing lives
 * in cursors.ts.
 */

/** WebSocket's "open" readyState, so nothing here depends on the global. */
const OPEN = 1;

/** As much of a WebSocket as any of this touches. */
export interface Socket {
  readyState: number;
  send(data: string): void;
  close(): void;
}

/** How a socket reports back. A fresh set per attempt. */
export interface LinkHandlers {
  opened(): void;
  received(data: string): void;
  /** Closed, failed, or refused — the link does not distinguish. */
  gone(): void;
}

export interface LinkOptions {
  /**
   * Opens a socket and wires it to `handlers`, once per attempt. They must
   * fire after it returns, as a real socket's would.
   */
  open(handlers: LinkHandlers): Socket;
  /** Waits `ms`, then calls `fn`. Returns a function that cancels the wait. */
  wait(ms: number, fn: () => void): () => void;
  /** Jitter for the reconnect backoff. Defaults to Math.random. */
  random?(): number;
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
  /** Reconnecting has failed enough to admit to. Still trying, just slowly. */
  readonly stalled: boolean;
  /** Whether the link has been told no and stopped. See `halt`. */
  readonly halted: boolean;
  /** Sends on the open socket. Does nothing when there is not one. */
  send(data: string): void;
  /** Hangs up and stays down until `wake`. For an idle tab. */
  sleep(): void;
  /** A sign of life. Reconnects, but only from `sleep`. */
  wake(): void;
  /**
   * Connect now, from the bottom of the backoff. For anything suggesting
   * conditions have changed — a tab regaining focus, a navigation.
   */
  revive(): void;
  /** Puts the socket down for good. Unlike `sleep`, `wake` will not revive it. */
  drop(): void;
  /**
   * Stop — the other end answered no, and will say the same to the next
   * socket. Stronger than `sleep`; only `revive` comes back from it.
   */
  halt(): void;
  /** Permanent. Nothing opens another socket after this. */
  destroy(): void;
}

export function link(options: LinkOptions): Link {
  let socket: Socket | null = null;
  let attempt = 0;
  let cancelWait: (() => void) | null = null;
  let asleep = false;
  let halted = false;
  let done = false;

  // A socket keeps talking after we stop listening — one failure is `error`
  // then `close` — so handlers carry their generation and go quiet once it moves.

  let generation = 0;

  function connect() {
    if (done || halted || socket) return;

    asleep = false;
    const mine = ++generation;

    socket = options.open({
      opened() {
        if (mine !== generation) return;

        // A connection that worked resets the backoff.
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

    const delay = reconnectDelay(attempt, options.random);
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
    // Ignore whatever this socket says next, including its own close event.
    generation += 1;

    if (!going) return;
    going.close();
    options.onClose?.();
    options.onState?.();
  }

  connect();

  return {
    get live() {
      return socket !== null && socket.readyState === OPEN;
    },

    get stalled() {
      // Halted is not stalled — nothing is being retried.
      return !halted && isStalled(attempt);
    },

    get halted() {
      return halted;
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
      if (done || halted || socket || !asleep) return;
      connect();
    },

    revive() {
      if (done || socket) return;

      stopWaiting();
      attempt = 0;
      // Fresh evidence is what a refusal was waiting for.
      halted = false;
      connect();
    },

    drop,

    halt() {
      if (halted) return;
      halted = true;

      // drop() reports the change, but only if there was a socket to put down;
      // a refusal arriving mid-backoff has to say so itself.
      if (socket) drop();
      else {
        stopWaiting();
        options.onState?.();
      }
    },

    destroy() {
      done = true;
      drop();
    },
  };
}
