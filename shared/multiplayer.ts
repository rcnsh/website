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
 * a tab open and moving the mouse continuously is roughly:
 *
 * | rate   | requests/hour | vs the 100k/day free tier   |
 * | ------ | ------------- | --------------------------- |
 * | 60 Hz  | ~216k         | a day's allowance in ~28 min |
 * | 30 Hz  | ~108k         | a day's allowance in ~56 min |
 * | 20 Hz  | ~72k          | ~1h 23m                     |
 * | 10 Hz  | ~36k          | ~2h 46m                     |
 *
 * The free allowance is **100,000 requests per day**. An earlier version of
 * this table said 1M/day and was wrong by a factor of ten in the direction
 * that matters: 1M is the *monthly* included amount on the paid plan, not a
 * daily free one. Every rate here is more expensive than it used to look.
 *
 * These are worst-case figures — a resting pointer sends nothing, and idle
 * sockets hang up — but they are the right way round to think about it.
 *
 * Turn this down before reaching for anything else. Below about 15 Hz the
 * smoothing stops being able to hide the gap and cursors start to visibly
 * step; above 60 there is nothing left to gain, since the client cannot sample
 * a pointer faster than it draws. 20 is the current compromise: still smooth
 * under SMOOTH_TAU_MS, and roughly three times the headroom of 60.
 */
export const CURSOR_HZ = 20;

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
 * Half again over the target rate. The slack above means a fast display paces
 * somewhat above the nominal rate, and clipping those honest clients to make
 * the number tidy would cost them every fourth position for nothing.
 *
 * A client that ignores the cap has its socket closed — see Budget in the
 * Worker's protocol.ts. It cannot have its excess "dropped rather than
 * billed", which is what this comment used to claim: delivery is the billed
 * event, so by the time anything here could decide to drop a message it has
 * already been paid for.
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
