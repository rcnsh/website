export type Sweep = () => Promise<void>;

export function scheduledHandler(sweep: Sweep): ExportedHandlerScheduledHandler<Env> {
  return async () => {
    await sweep();
  };
}
