import { createHandler } from "./handler.ts";

// The entry exports only the handler: Workers read any other export as an entrypoint.
export default createHandler();
