import { getSession, isOwner } from "./auth";
import { ownerGuard } from "./owner-guard.ts";

export type { OwnerCheck, Refusal, Viewer } from "./owner-guard.ts";

export const { identify, refuse, requireOwner } = ownerGuard(async (cookies) => {
  const session = await getSession(cookies);
  return { session, owner: isOwner(session) };
});
