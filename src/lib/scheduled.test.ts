import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduledHandler } from "./scheduled.ts";

const controller = { cron: "17 4 * * *", scheduledTime: 0, type: "scheduled", noRetry() {} } as ScheduledController;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

test("a scheduled event sweeps expired sessions once", async () => {
  let calls = 0;
  const scheduled = scheduledHandler(async () => {
    calls += 1;
  });
  await scheduled(controller, {} as Env, ctx);
  assert.equal(calls, 1);
});

test("a failed sweep fails the scheduled event", async () => {
  const scheduled = scheduledHandler(async () => {
    throw new Error("d1 down");
  });
  await assert.rejects(Promise.resolve(scheduled(controller, {} as Env, ctx)), /d1 down/);
});
