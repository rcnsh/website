import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  RECONNECT_MAX_MS,
  RECONNECT_MIN_MS,
  reconnectDelay,
  STALL_AFTER_ATTEMPTS,
} from "./cursors.ts";
import { link, type LinkHandlers, type Socket } from "./link.ts";

/** A WebSocket's readyState values, as the spec numbers them. */
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/** A socket the test drives by hand rather than one that does anything. */
interface Fake extends Socket {
  handlers: LinkHandlers;
  sent: string[];
  closes: number;
}

interface Wait {
  at: number;
  fn: () => void;
  cancelled: boolean;
  fired: boolean;
}

/**
 * A link wired to a hand-cranked clock and hand-cranked sockets. Nothing waits:
 * time passes and sockets connect only when a test says so.
 */
function session() {
  const sockets: Fake[] = [];
  const waits: Wait[] = [];
  /** Every callback the link made, in order. */
  const log: string[] = [];
  /** What the link claimed about itself each time it said something changed. */
  const states: { live: boolean; stalled: boolean }[] = [];
  let now = 0;

  const connection = link({
    open(handlers) {
      const socket: Fake = {
        handlers,
        sent: [],
        closes: 0,
        readyState: CONNECTING,
        send(data) {
          socket.sent.push(data);
        },
        close() {
          socket.closes += 1;
          socket.readyState = CLOSED;
        },
      };

      sockets.push(socket);
      return socket;
    },

    wait(ms, fn) {
      const pending: Wait = { at: now + ms, fn, cancelled: false, fired: false };
      waits.push(pending);
      return () => {
        pending.cancelled = true;
      };
    },

    /*
      Pinned to the top of the jitter window so every delay in these tests is
      the exponential ceiling exactly. Jitter's own behaviour is covered in
      cursors.test.ts; leaving it random here would make these assertions
      flaky for no gain.
    */
    random: () => 1,

    onOpen: () => log.push("open"),
    onMessage: (data) => log.push(`message:${data}`),
    onClose: () => log.push("close"),
    onState: () => {
      log.push("state");
      states.push({ live: connection.live, stalled: connection.stalled });
    },
  });

  function latest(): Fake {
    const socket = sockets.at(-1);
    assert.ok(socket, "expected a socket to have been opened");
    return socket;
  }

  return {
    connection,
    sockets,
    log,
    states,

    /** How many sockets have ever been opened. */
    get opens() {
      return sockets.length;
    },

    /** The most recent socket. */
    get socket() {
      return latest();
    },

    /** How long the queued reconnect has left, or null if none is queued. */
    get queued(): number | null {
      const wait = waits.find((w) => !w.cancelled && !w.fired);
      return wait ? wait.at - now : null;
    },

    /** The current socket finishes connecting. */
    accept() {
      const socket = latest();
      socket.readyState = OPEN;
      socket.handlers.opened();
    },

    /**
     * The current socket goes away — twice over, because a real one reports
     * `error` and then `close` for a single failure and the link is supposed
     * to hear that as one.
     */
    fail() {
      const socket = latest();
      socket.readyState = CLOSED;
      socket.handlers.gone();
      socket.handlers.gone();
    },

    /** Runs every wait that comes due in the next `ms`. */
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = waits
          .filter((w) => !w.cancelled && !w.fired && w.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;

        due.fired = true;
        now = due.at;
        due.fn();
      }
      now = until;
    },

    /** Fails `times` connections in a row, waiting out each backoff. */
    collapse(times: number) {
      for (let i = 0; i < times; i++) {
        this.fail();
        this.advance(this.queued ?? 0);
      }
    },
  };
}

describe("connecting", () => {
  test("opens a socket without being asked", () => {
    const s = session();

    assert.equal(s.opens, 1);
  });

  test("is not live until the socket says it is", () => {
    const s = session();
    assert.equal(s.connection.live, false);

    s.accept();

    assert.equal(s.connection.live, true);
    assert.deepEqual(s.states.at(-1), { live: true, stalled: false });
  });

  /*
    The second of the two bugs this module was extracted over: the panel read
    its status off a peer count, so a socket that had never opened looked
    exactly like an empty room. Whatever else changes, opening has to be
    something the caller is told about.
  */
  test("says so when the socket opens", () => {
    const s = session();
    s.accept();

    assert.deepEqual(s.log, ["open", "state"]);
  });

  test("sends only down a socket that is open", () => {
    const s = session();

    s.connection.send("too early");
    assert.deepEqual(s.socket.sent, []);

    s.accept();
    s.connection.send("now");
    assert.deepEqual(s.socket.sent, ["now"]);
  });

  test("passes on what the socket says", () => {
    const s = session();
    s.accept();
    s.socket.handlers.received('{"t":"hi"}');

    assert.ok(s.log.includes('message:{"t":"hi"}'));
  });
});

describe("losing the connection", () => {
  test("knocks again after the shortest wait", () => {
    const s = session();
    s.accept();
    s.fail();

    assert.equal(s.queued, RECONNECT_MIN_MS);
    s.advance(RECONNECT_MIN_MS);
    assert.equal(s.opens, 2);
  });

  test("stops claiming to be connected the moment the socket goes", () => {
    const s = session();
    s.accept();
    s.fail();

    assert.equal(s.connection.live, false);
    assert.equal(s.states.at(-1)?.live, false);
  });

  /*
    A WebSocket reports `error` and then `close` for one failed connection.
    Counted twice, the backoff doubles at half the intended rate and two
    reconnects race — one of which nothing is holding on to.
  */
  test("hears one failure when the socket reports it twice", () => {
    const s = session();
    s.accept();
    s.fail();

    assert.equal(s.log.filter((e) => e === "close").length, 1);
    s.advance(RECONNECT_MAX_MS);
    assert.equal(s.opens, 2);
  });

  /*
    The harness pins the jitter RNG to 1, so `reconnectDelay` returns its
    ceiling and the doubling is still assertable exactly. What is being tested
    here is that the delay grows with the attempt count, not the jitter — that
    has its own tests in cursors.test.ts.
  */
  test("waits longer each time it fails", () => {
    const s = session();
    const ceiling = () => 1;

    for (const attempt of [0, 1, 2, 3]) {
      s.fail();
      assert.equal(s.queued, reconnectDelay(attempt, ceiling));
      s.advance(reconnectDelay(attempt, ceiling));
    }
  });

  /*
    The first of the two bugs. The ceiling used to be fifteen seconds, so a
    client whose room was gone knocked four times a minute for the rest of the
    session — a request and a console error each time, for something that was
    not coming back on its own.
  */
  test("gives up hurrying long before it gives up", () => {
    const s = session();
    s.collapse(30);
    s.fail();

    assert.equal(s.queued, RECONNECT_MAX_MS);
  });

  /*
    Nothing else resets the count, so without this a session that dropped four
    times over an afternoon would take five minutes to notice the fifth — and
    would describe itself as stalled while perfectly healthy.
  */
  test("starts over after a connection that worked", () => {
    const s = session();
    s.collapse(4);
    assert.equal(s.connection.stalled, false, "four attempts is not a stall");

    s.accept();
    s.fail();

    assert.equal(s.queued, RECONNECT_MIN_MS);
  });

  test("forgets a stall once it reconnects", () => {
    const s = session();
    s.collapse(STALL_AFTER_ATTEMPTS + 2);
    assert.equal(s.connection.stalled, true);

    s.accept();

    assert.equal(s.connection.stalled, false);
    assert.deepEqual(s.states.at(-1), { live: true, stalled: false });
  });
});

describe("admitting to a stall", () => {
  test("stays quiet through a blip", () => {
    const s = session();
    s.collapse(1);

    assert.equal(s.connection.stalled, false);
  });

  test("owns up once the attempts add up", () => {
    const s = session();
    s.collapse(STALL_AFTER_ATTEMPTS + 1);

    assert.equal(s.connection.stalled, true);
    assert.ok(
      s.states.some((state) => state.stalled),
      "the reader was never told",
    );
  });

  test("reports every attempt, so the panel is never stale", () => {
    const s = session();
    const before = s.states.length;
    s.collapse(3);

    assert.ok(s.states.length >= before + 3);
  });
});

describe("reviving", () => {
  test("connects now rather than sitting out the rest of the wait", () => {
    const s = session();
    s.collapse(STALL_AFTER_ATTEMPTS + 1);
    s.fail();
    assert.ok((s.queued ?? 0) > 10_000, "the wait should be a long one");

    const opens = s.opens;
    s.connection.revive();

    assert.equal(s.opens, opens + 1);
    assert.equal(s.queued, null, "the old wait should have been called off");
  });

  test("drops the backoff with it", () => {
    const s = session();
    s.collapse(6);
    s.fail();
    s.connection.revive();
    s.fail();

    assert.equal(s.queued, RECONNECT_MIN_MS);
    assert.equal(s.connection.stalled, false);
  });

  test("leaves a working connection alone", () => {
    const s = session();
    s.accept();
    s.connection.revive();

    assert.equal(s.opens, 1);
    assert.equal(s.connection.live, true);
  });
});

describe("sleeping", () => {
  test("hangs up and stays down", () => {
    const s = session();
    s.accept();
    s.connection.sleep();

    assert.equal(s.socket.closes, 1);
    assert.equal(s.connection.live, false);
    assert.equal(s.queued, null);

    s.advance(60 * 60 * 1000);
    assert.equal(s.opens, 1, "an hour asleep should not have opened anything");
  });

  test("comes back on the next sign of life", () => {
    const s = session();
    s.accept();
    s.connection.sleep();
    s.connection.wake();

    assert.equal(s.opens, 2);
  });

  test("is not fooled by the close its own hang-up provokes", () => {
    const s = session();
    s.accept();
    const socket = s.socket;
    s.connection.sleep();
    socket.handlers.gone();

    assert.equal(s.queued, null, "a deliberate hang-up must not reconnect");
    assert.equal(s.opens, 1);
  });

  test("waking a live connection changes nothing", () => {
    const s = session();
    s.accept();
    s.connection.wake();

    assert.equal(s.opens, 1);
  });

  /*
    A reader waving the mouse about during an outage should not get a
    connection attempt per pointermove — the backoff is what stops that, and
    wake has no business overruling it.
  */
  test("waking a connection that is only retrying changes nothing", () => {
    const s = session();
    s.fail();
    const queued = s.queued;

    s.connection.wake();
    s.connection.wake();

    assert.equal(s.opens, 1);
    assert.equal(s.queued, queued);
  });
});

describe("dropping", () => {
  test("puts the socket down without arranging to come back", () => {
    const s = session();
    s.accept();
    s.connection.drop();

    assert.equal(s.socket.closes, 1);
    assert.equal(s.queued, null);
    s.advance(RECONNECT_MAX_MS);
    assert.equal(s.opens, 1);
  });

  test("tells the caller, so the peers on screen go with it", () => {
    const s = session();
    s.accept();
    s.connection.drop();

    assert.equal(s.log.filter((e) => e === "close").length, 1);
  });

  test("a wake signal does not undo it", () => {
    const s = session();
    s.accept();
    s.connection.drop();
    s.connection.wake();

    assert.equal(s.opens, 1);
  });

  test("but reviving does", () => {
    const s = session();
    s.accept();
    s.connection.drop();
    s.connection.revive();

    assert.equal(s.opens, 2);
  });

  test("calls off a reconnect that was already queued", () => {
    const s = session();
    s.fail();
    assert.ok(s.queued !== null);

    s.connection.drop();

    assert.equal(s.queued, null);
    s.advance(RECONNECT_MAX_MS);
    assert.equal(s.opens, 1);
  });
});

describe("destroying", () => {
  test("closes the socket", () => {
    const s = session();
    s.accept();
    s.connection.destroy();

    assert.equal(s.socket.closes, 1);
    assert.equal(s.connection.live, false);
  });

  test("cancels a reconnect that would have fired later", () => {
    const s = session();
    s.fail();
    s.connection.destroy();

    s.advance(RECONNECT_MAX_MS);
    assert.equal(s.opens, 1);
  });

  test("never opens another socket, whatever it is asked", () => {
    const s = session();
    s.accept();
    const socket = s.socket;
    s.connection.destroy();

    s.connection.wake();
    s.connection.revive();
    s.connection.drop();
    socket.handlers.gone();
    s.advance(RECONNECT_MAX_MS);

    assert.equal(s.opens, 1);
  });

  test("stops listening to the socket it closed", () => {
    const s = session();
    s.accept();
    const socket = s.socket;
    s.connection.destroy();
    socket.handlers.received("too late");

    assert.ok(!s.log.some((e) => e.startsWith("message:")));
  });

  test("swallows a send with nowhere to go", () => {
    const s = session();
    s.accept();
    const socket = s.socket;
    s.connection.destroy();
    s.connection.send("into the void");

    assert.deepEqual(socket.sent, []);
  });
});

describe("one socket at a time", () => {
  /*
    Every one of these is a socket the link has stopped listening to still
    talking. Acted on, a stale close schedules a reconnect on top of a live
    connection, and a stale message draws cursors from a room the reader has
    already left.
  */
  test("ignores a socket it has already replaced", () => {
    const s = session();
    const first = s.socket;
    s.fail();
    s.advance(RECONNECT_MIN_MS);
    s.accept();

    first.handlers.received("stale");
    first.handlers.gone();

    assert.ok(!s.log.includes("message:stale"));
    assert.equal(s.connection.live, true);
    assert.equal(s.queued, null);
  });

  test("ignores a socket that opens after it has been abandoned", () => {
    const s = session();
    const first = s.socket;
    s.connection.drop();
    s.connection.revive();

    first.handlers.opened();

    assert.equal(s.opens, 2);
    assert.equal(s.connection.live, false, "the new socket has not opened yet");
  });

  test("never has two sockets in flight", () => {
    const s = session();
    s.connection.revive();
    s.connection.wake();
    s.connection.revive();

    assert.equal(s.opens, 1);
  });
});

/* A refusal is an answer, not a failure — knocking again gets the same one. */
describe("being told no", () => {
  test("puts the socket down and does not knock again", () => {
    const s = session();
    s.accept();
    s.connection.halt();

    assert.equal(s.connection.live, false);
    assert.equal(s.socket.closes, 1);
    assert.equal(s.queued, null);

    s.advance(RECONNECT_MAX_MS * 2);
    assert.equal(s.opens, 1);
  });

  test("says so, so the panel can stop saying 'connecting'", () => {
    const s = session();
    s.accept();
    s.connection.halt();

    assert.equal(s.states.at(-1)?.live, false);
    assert.equal(s.connection.halted, true);
  });

  test("is not stalled — nothing is being retried", () => {
    const s = session();
    s.collapse(STALL_AFTER_ATTEMPTS + 2);
    assert.equal(s.connection.stalled, true);

    s.connection.halt();
    assert.equal(s.connection.stalled, false);
  });

  /*
    The difference from sleep(). A sleeping link is one nobody is looking at,
    and the pointer moving is news; a halted one has been told the answer, and
    the pointer moving is not.
  */
  test("a sign of life does not undo it", () => {
    const s = session();
    s.accept();
    s.connection.halt();

    s.connection.wake();
    assert.equal(s.opens, 1);
  });

  test("but coming back to the tab does", () => {
    const s = session();
    s.accept();
    s.connection.halt();

    s.connection.revive();

    assert.equal(s.opens, 2);
    assert.equal(s.connection.halted, false);
  });

  test("still reports the refusal when there was no socket to close", () => {
    const s = session();
    s.fail();
    const before = s.states.length;

    s.connection.halt();

    assert.ok(s.states.length > before, "the change went unreported");
    assert.equal(s.queued, null, "a reconnect was left queued");
  });

  test("destroy still wins", () => {
    const s = session();
    s.accept();
    s.connection.halt();
    s.connection.destroy();
    s.connection.revive();

    assert.equal(s.opens, 1);
  });
});
