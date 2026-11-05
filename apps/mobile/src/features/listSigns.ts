/**
 * Computed signs on list cards (docs/15-story-map.md §5 «вычисляемые»): NOT statuses.
 * Shown as a second chip next to the status, never stored, set and removed only by these rules.
 * Thresholds are the same as «Требует внимания» (features/attention.ts) so a card and the attention list agree.
 * Unit-tested in test/listSigns.test.ts: when each sign appears and when it goes away.
 */
import { timing } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import type { Estimate, Invoice, Lead, Visit } from "@/data/types";

export interface Sign {
  key: DictKey;
  params?: Record<string, number>;
  tone: "warn" | "bad";
}

const DAY = 86_400_000;
const days = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
/** end of the due day, local time (same as selectors.isOverdue) */
const endOfDay = (iso: string) => {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Estimate sent and not answered: from estimateWarnDays (warn), from estimateBadDays (bad). Goes away when it is approved or declined. */
export function estimateSigns(e: Pick<Estimate, "status" | "sentAt">, now = Date.now()): Sign[] {
  if (e.status !== "sent" || !e.sentAt) return [];
  const d = days(e.sentAt, now);
  if (d < timing.estimateWarnDays) return [];
  return [{ key: "att.noReplyDays", params: { d }, tone: d >= timing.estimateBadDays ? "bad" : "warn" }];
}

/** Invoice with a balance: overdue N days (bad) after the due day; due today / tomorrow (warn). Goes away when fully paid. */
export function invoiceSigns(i: Pick<Invoice, "totalCents" | "paidCents" | "dueDate">, now = Date.now()): Sign[] {
  if (i.paidCents >= i.totalCents || !i.dueDate) return [];
  const end = endOfDay(i.dueDate);
  if (end < now) return [{ key: "card.sign.overdueDays", params: { d: Math.max(1, Math.ceil((now - end) / DAY)) }, tone: "bad" }];
  const left = Math.floor((end - now) / DAY);
  if (left === 0) return [{ key: "card.sign.dueToday", tone: "warn" }];
  if (left === 1) return [{ key: "card.sign.dueTomorrow", tone: "warn" }];
  return [];
}

/** Open lead we could not reach 2+ times in a row. Goes away on the first answered call (store resets callAttempts) or when the lead moves on. */
export const MISSED_CALLS_MIN = 2;
export function leadSigns(l: Pick<Lead, "status" | "callAttempts">): Sign[] {
  const n = l.callAttempts ?? 0;
  if ((l.status !== "new" && l.status !== "replied") || n < MISSED_CALLS_MIN) return [];
  return [{ key: "card.sign.missedCalls", params: { n }, tone: "warn" }];
}

/** Visit marked late while the tech has not arrived yet. Goes away on arrival (step on_site and later). Same rule as features/visits.tsx. */
export function visitSigns(v: Pick<Visit, "late" | "step">): Sign[] {
  if (!v.late || (v.step !== "scheduled" && v.step !== "en_route")) return [];
  return [{ key: "st.late", tone: "warn" }];
}
