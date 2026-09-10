/**
 * Tuning for the live cursors. Client and Durable Object deploy separately but
 * must agree on the rate, so there is one knob and the rest derives from it.
 * Imported by relative path from both: only one bundler reads tsconfig aliases.
 */

/**
 * Wire rate for cursor positions, in hertz — the number that decides what the
 * feature costs, since every message is a billed Durable Object request. Turn
 * it down before reaching for anything else. Below ~15 Hz the smoothing stops
 * hiding the gap; above 60 there is nothing to gain.
 */
export const CURSOR_HZ = 20;

/** The nominal gap between two positions, in milliseconds. */
const INTERVAL_MS = 1000 / CURSOR_HZ;

/**
 * Slack subtracted from the send interval. Sending is paced off animation
 * frames, so an interval on the frame time halves the rate on a ms of jitter.
 */
const SEND_SLACK_MS = 3;

/** Client: the floor between two sends. */
export const SEND_INTERVAL_MS = Math.max(1, INTERVAL_MS - SEND_SLACK_MS);

/** Server: how often the room batches pending positions and fans them out. */
export const FLUSH_INTERVAL_MS = INTERVAL_MS;

/**
 * Server: per-socket message budget per second. Half again over the target,
 * since SEND_SLACK_MS puts a fast display above nominal. Over it, the socket
 * closes — see Budget in protocol.ts.
 */
export const MAX_MESSAGES_PER_SECOND = Math.ceil(CURSOR_HZ * 1.5);

/**
 * Client: time constant for position smoothing. Scaled to the interval, with a
 * floor so high rates still absorb jitter rather than snapping to every packet.
 */
export const SMOOTH_TAU_MS = Math.max(18, INTERVAL_MS * 1.5);
