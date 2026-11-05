/**
 * «Звонки» and «Сообщения» tabs, wave 2 (docs/specs/13 §2.1, 13а §3): an honest log of what the app already records —
 * the «позвонить» / «SMS» / «письмо» buttons write an activity (touchLead). No own phone number yet, so no inbound,
 * no unread or missed counters. Wave 6 grows these into full screens.
 * Pure (no React) — unit-tested in test/comms.test.ts.
 */
import type { Activity, CallOutcome, DB, Role } from "@/data/types";

export type CommsKind = "calls" | "messages";
const KINDS: Record<CommsKind, readonly Activity["kind"][]> = { calls: ["call"], messages: ["sms", "email"] };

export interface CommsEntry {
  id: string;
  kind: Activity["kind"];
  at: string;
  /** who the call or message was with (lead, client, job title or estimate number) */
  who: string;
  href?: string;
  /** who in the team made it */
  by?: string;
  outcome?: CallOutcome;
}

/** Newest first. The technician sees only his own (13 §2.1: «мастер видит звонки и сообщения по своим выездам»). */
export function commsLog(db: DB, role: Role, kind: CommsKind): CommsEntry[] {
  const kinds = KINDS[kind];
  return db.activities
    .filter((a) => kinds.includes(a.kind) && (role !== "tech" || a.actorId === db.me))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((a) => {
      const s = subject(db, a);
      const outcome = a.meta?.outcome as CallOutcome | undefined;
      return { id: a.id, kind: a.kind, at: a.at, who: s.who, href: s.href, by: db.members.find((m) => m.id === a.actorId)?.name, ...(outcome ? { outcome } : {}) };
    });
}

function subject(db: DB, a: Activity): { who: string; href?: string } {
  switch (a.subjectType) {
    case "lead": {
      const l = db.leads.find((x) => x.id === a.subjectId);
      return { who: l?.name ?? "", href: l ? `/lead/${l.id}` : undefined };
    }
    case "customer": {
      const c = db.customers.find((x) => x.id === a.subjectId);
      return { who: c?.name ?? "", href: c ? `/client/${c.id}` : undefined };
    }
    case "job": {
      const j = db.jobs.find((x) => x.id === a.subjectId);
      return { who: j?.title ?? "", href: j ? `/job/${j.id}` : undefined };
    }
    case "estimate": {
      const e = db.estimates.find((x) => x.id === a.subjectId);
      return { who: e?.number ?? "", href: e ? `/estimate/${e.id}` : undefined };
    }
  }
}
