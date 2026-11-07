import { syncState } from "@/nav/shell";
import type { Link } from "./store";

/**
 * What the sync badge says (docs/specs/23 §3): nothing; «sending»; «offline» — no answer at all; «server» — the
 * network is there, the server answers «not now» (5xx, 429, PGRST002…). Pure: test/syncLink.test.ts.
 */
export type BadgeState = "offline" | "server" | "sending" | null;
export const badgeState = (online: boolean, link: Link, queued: number): BadgeState => {
  const base = syncState(online, queued);
  return base === "offline" && link === "server" ? "server" : base;
};
