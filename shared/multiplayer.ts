/**
 * Tuning for the live cursors, shared by both halves of the feature.
 *
 * The client (src/lib/multiplayer.ts) and the Durable Object
 * (workers/multiplayer/src/index.ts) are built and deployed separately, but
 * their rates have to agree: a room that flushes slower than clients send
 * throws away positions they are paying to deliver, and a budget below the
 * send rate silently drops every honest client's movement. Keeping the numbers
 * in two files meant three edits to change one thing, and no way to notice
 * when only two of them happened.
 *
 * So there is one knob here, and everything else is derived from it.
 *
 * Imported by relative path from both sides on purpose. The two are bundled by
 * different tools — Vite for the site, esbuild via wrangler for the Worker —
 * and a tsconfig path alias is only reliably understood by one of them.
 */

/**
 * How often a cursor's position goes over the wire, in hertz.
 *
 * **This is the number that decides what the feature costs.** Every inbound
 * WebSocket message is a billed Durable Object request, so one person holding
 * a tab open and moving the mouse is roughly:
 *
 * | rate   | requests/day, sustained | vs the 1M/day free tier |
 * | ------ | ----------------------- | ----------------------- |
 * | 60 Hz  | ~5.2M                   | over by ~5x             |
 * | 30 Hz  | ~2.6M                   | over by ~2.6x           |
 * | 20 Hz  | ~1.7M                   | over by ~1.7x           |
 * | 10 Hz  | ~864k                   | inside it               |
 *
 * Those are worst-case figures — a resting pointer sends nothing, and idle
 * sockets hang up — but they are the right way round to think about it.
 *
 * Turn this down before reaching for anything else. Below about 15 Hz the
 * smoothing stops being able to hide the gap and cursors start to visibly
 * step; above 60 there is nothing left to gain, since the client cannot sample
 * a pointer faster than it draws.
 */
export const CURSOR_HZ = 60;

/** The nominal gap between two positions, in milliseconds. */
const INTERVAL_MS = 1000 / CURSOR_HZ;

/**
 * Slack subtracted from the client's send interval.
 *
 * Sending is paced off animation frames. At 60 Hz a bare interval would sit
 * exactly on a 60 Hz display's frame time, so a millisecond of scheduling
 * jitter pushes a frame under the threshold and visibly halves the rate. A few
 * milliseconds of give absorbs that.
 */
const SEND_SLACK_MS = 3;

/**
 * Client: the floor between two sends.
 *
 * Clamped at zero slack for very low rates, where the jitter allowance stops
 * mattering and would only distort the interval.
 */
export const SEND_INTERVAL_MS = Math.max(1, INTERVAL_MS - SEND_SLACK_MS);

/** Server: how often the room batches pending positions and fans them out. */
export const FLUSH_INTERVAL_MS = INTERVAL_MS;

/**
 * Server: per-socket message budget, per second.
 *
 * Half again over the target rate. The slack above means a 144 Hz display
 * paces nearer 72 Hz than 60, and clipping those honest clients to make the
 * number tidy would cost them every fourth position for nothing. A client
 * ignoring the cap entirely still gets its excess dropped rather than billed.
 */
export const MAX_MESSAGES_PER_SECOND = Math.ceil(CURSOR_HZ * 1.5);

/**
 * Client: time constant for the position smoothing.
 *
 * Scaled to the interval rather than fixed, because the two are the same
 * question asked twice — the smoothing exists to hide the gap between
 * positions, so a slower feed needs a longer tail and a faster one needs less
 * of it. Held to a floor so that at high rates it still absorbs network jitter
 * instead of snapping to every packet.
 */
export const SMOOTH_TAU_MS = Math.max(18, INTERVAL_MS * 1.5);
