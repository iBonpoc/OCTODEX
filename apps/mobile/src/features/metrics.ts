/**
 * Owner numbers for a period (today / this week / this month), by the date each event happened:
 * leads received → estimates sent → estimates signed → money received. Amounts are integer cents.
 */
import type { DB } from "@/data/types";
import { addDays, addMonths, isoDayKey, todayKey, weekStart, type DayKey } from "./calendar";

export type Period = "today" | "week" | "month";

/** inclusive [from, to] day keys; week starts Monday, month = calendar month */
export function periodRange(p: Period, today: DayKey = todayKey()): { from: DayKey; to: DayKey } {
  if (p === "today") return { from: today, to: today };
  if (p === "week") {
    const from = weekStart(today);
    return { from, to: addDays(from, 6) };
  }
  const from = `${today.slice(0, 8)}01`;
  return { from, to: addDays(addMonths(from, 1), -1) };
}

const inRange = (iso: string | undefined, r: { from: DayKey; to: DayKey }) => {
  if (!iso) return false;
  const k = isoDayKey(iso);
  return k >= r.from && k <= r.to;
};

/** share in whole percent, round half up; 0 when there is nothing to compare with */
export const pct = (part: number, whole: number) => (whole > 0 ? Math.floor((part * 100) / whole + 0.5) : 0);

export interface PeriodNumbers {
  leads: number;
  sent: number;
  signed: number;
  signedCents: number;
  receivedCents: number;
  payments: number;
  /** open balance on all issued invoices (not tied to the period) */
  awaitingCents: number;
  /** estimate sent / leads, signed / sent (whole %) */
  leadToSentPct: number;
  sentToSignedPct: number;
}

export function periodNumbers(db: DB, p: Period, today?: DayKey): PeriodNumbers {
  const r = periodRange(p, today);
  const leads = db.leads.filter((l) => inRange(l.receivedAt, r)).length;
  const sent = db.estimates.filter((e) => inRange(e.sentAt, r)).length;
  const signedList = db.estimates.filter((e) => e.status === "approved" && inRange(e.approvedAt, r));
  const pays = db.payments.filter((x) => inRange(x.at, r));
  return {
    leads,
    sent,
    signed: signedList.length,
    signedCents: signedList.reduce((s, e) => s + e.totalCents, 0),
    receivedCents: pays.reduce((s, x) => s + x.amountCents, 0),
    payments: pays.length,
    awaitingCents: db.invoices.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0),
    leadToSentPct: pct(sent, leads),
    sentToSignedPct: pct(signedList.length, sent),
  };
}

/** What each number on "Today" counts — the drill-down shows exactly these records (count = number on the tile). */
export type Figure = "leads" | "sent" | "signed" | "received" | "awaiting";
export const FIGURES: Figure[] = ["leads", "sent", "signed", "received", "awaiting"];
export interface FigureItems {
  leads: DB["leads"];
  estimates: DB["estimates"];
  payments: DB["payments"];
  invoices: DB["invoices"];
}
export function figureItems(db: DB, f: Figure, p: Period, today?: DayKey): FigureItems {
  const r = periodRange(p, today);
  const none: FigureItems = { leads: [], estimates: [], payments: [], invoices: [] };
  const newest = <T,>(at: (x: T) => string | undefined) => (a: T, b: T) => (at(b) ?? "").localeCompare(at(a) ?? "");
  switch (f) {
    case "leads":
      return { ...none, leads: db.leads.filter((l) => inRange(l.receivedAt, r)).sort(newest((l) => l.receivedAt)) };
    case "sent":
      return { ...none, estimates: db.estimates.filter((e) => inRange(e.sentAt, r)).sort(newest((e) => e.sentAt)) };
    case "signed":
      return { ...none, estimates: db.estimates.filter((e) => e.status === "approved" && inRange(e.approvedAt, r)).sort(newest((e) => e.approvedAt)) };
    case "received":
      return { ...none, payments: db.payments.filter((x) => inRange(x.at, r)).sort(newest((x) => x.at)) };
    case "awaiting":
      return { ...none, invoices: db.invoices.filter((i) => i.totalCents - i.paidCents > 0).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")) };
  }
}
