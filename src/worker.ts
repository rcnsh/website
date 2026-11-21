import server from "@astrojs/cloudflare/entrypoints/server";
import { sweepExpiredSessions } from "./lib/auth";
import { scheduledHandler } from "./lib/scheduled";

export default {
  fetch: server.fetch,
  scheduled: scheduledHandler(sweepExpiredSessions),
} satisfies ExportedHandler<Env>;
