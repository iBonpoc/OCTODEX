import { syncState } from "@/nav/shell";
import type { DictKey } from "@/i18n";
import type { Link } from "./store";

/**
 * What the sync badge says (docs/specs/23 §3): nothing; «sending»; «offline» — no answer at all; «server» — the
 * network is there, the server answers «not now» (5xx, 429, PGRST002…); «stuck» — changes the server keeps answering
 * with an error (listed in «Профиль и аккаунт»). Pure: test/syncLink.test.ts.
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
    case "invoice": case "payment": return "sync.kind.money";
    case "expense": return "sync.kind.expense";
    case "job": case "jobLine": return "sync.kind.job";
    case "visit": case "photo": return kind === "visit.pay" ? "sync.kind.money" : "sync.kind.visit";
    case "task": case "calendarEvent": return "sync.kind.task";
    default: return "sync.kind.other";
  }
}

/** ops that carry money: when one of them leaves with a discarded change, the confirmation says so (review #259) */
export const MONEY_KINDS: ReadonlySet<string> = new Set(["payment.record", "visit.pay", "estimate.deposit", "invoice.issue", "invoice.pay", "expense.add"]);

/**
 * What leaves with a discarded change, for its confirmation (rule 5): each kind of change and how many, in the order
 * they come, and whether money is among them («вместе уйдут: Работа: 1, Счёт или оплата: 2»).
 */
export function leavingSummary(kinds: readonly string[]): { kinds: { key: DictKey; n: number }[]; money: boolean } {
  const out: { key: DictKey; n: number }[] = [];
  for (const k of kinds) {
    const key = stuckKindKey(k);
    const at = out.find((x) => x.key === key);
    if (at) at.n++;
    else out.push({ key, n: 1 });
  }
  return { kinds: out, money: kinds.some((k) => MONEY_KINDS.has(k)) };
}
