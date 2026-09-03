/**
 * Tuning for the live cursors. The client and the Durable Object are deployed
 * separately but their rates have to agree, so there is one knob here and
 * everything else derives from it.
 *
 * Imported by relative path from both sides: the two are bundled by different
 * tools, and only one of them understands a tsconfig path alias.
 */

/**
 * How often a cursor's position goes over the wire, in hertz. This is the
 * number that decides what the feature costs: every message is a billed
 * Durable Object request, and the free tier is 100k/day — one continuously
 * moving pointer is ~72k/hour at 20 Hz, ~216k at 60.
 *
 * Turn this down before reaching for anything else. Below ~15 Hz the smoothing
 * stops hiding the gap; above 60 there is nothing left to gain.
 */
export const CURSOR_HZ = 20;

/** The nominal gap between two positions, in milliseconds. */
const INTERVAL_MS = 1000 / CURSOR_HZ;

/**
 * Slack subtracted from the send interval. Sending is paced off animation
 * frames, so an interval sitting exactly on the frame time would halve the
 * rate on a millisecond of jitter.
 */
const SEND_SLACK_MS = 3;

/** Client: the floor between two sends. */
export const SEND_INTERVAL_MS = Math.max(1, INTERVAL_MS - SEND_SLACK_MS);

/** Server: how often the room batches pending positions and fans them out. */
export const FLUSH_INTERVAL_MS = INTERVAL_MS;

/**
 * Server: per-socket message budget, per second. Half again over the target
 * rate, since SEND_SLACK_MS puts a fast display somewhat above nominal. A
 * client that ignores it has its socket closed — see Budget in protocol.ts.
 */
export const MAX_MESSAGES_PER_SECOND = Math.ceil(CURSOR_HZ * 1.5);

/**
 * Client: time constant for the position smoothing. Scaled to the interval —
 * a slower feed needs a longer tail — with a floor so high rates still absorb
 * network jitter rather than snapping to every packet.
 */
export const SMOOTH_TAU_MS = Math.max(18, INTERVAL_MS * 1.5);
