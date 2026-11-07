import { syncState } from "@/nav/shell";
import type { DictKey } from "@/i18n";
import type { Link } from "./store";

/**
 * What the sync badge says (docs/specs/23 §3): nothing; «sending»; «offline» — no answer at all; «server» — the
 * network is there, the server answers «not now» (5xx, 429, PGRST002…); «stuck» — changes the server keeps answering
 * with an error (listed in «Настройки»). Pure: test/syncLink.test.ts.
 */
export type BadgeState = "offline" | "server" | "stuck" | "sending" | null;
export const badgeState = (online: boolean, link: Link, queued: number, stuck = 0): BadgeState => {
  const base = syncState(online, queued);
  if (base === "offline") return link === "server" ? "server" : "offline"; // why nothing goes out comes first
  return stuck > 0 ? "stuck" : base; // the server keeps refusing «for now» some changes: not «sending»
};

/** what kind of change it is, from the op's kind */
export function stuckKindKey(kind: string): DictKey {
  const head = kind.split(".")[0];
  switch (head) {
    case "customer": case "property": return "sync.kind.customer";
    case "contact": case "company": case "license": case "member": return "sync.kind.company";
    case "lead": return "sync.kind.lead";
    case "estimate": return kind === "estimate.deposit" ? "sync.kind.money" : "sync.kind.estimate";
    case "invoice": case "payment": case "expense": return "sync.kind.money";
    case "job": case "jobLine": return "sync.kind.job";
    case "visit": case "photo": return kind === "visit.pay" ? "sync.kind.money" : "sync.kind.visit";
    case "task": case "calendarEvent": return "sync.kind.task";
    default: return "sync.kind.other";
  }
}
