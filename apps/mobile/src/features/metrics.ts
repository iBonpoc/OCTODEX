/**
 * Owner numbers for a period (today / this week / this month), by the date each event happened:
 * leads received → estimates sent → estimates signed → money received. Amounts are integer cents.
 */
import type { DB } from "@/data/types";
import { addDays, addMonths, isoDayKey, todayKey, weekStart, type DayKey } from "./calendar";
import { estimateListAmount } from "./estimateDoc";
import { invoiceBalance } from "./invoiceStatus";
import { clientMoney } from "@octo/estimating-engine";
import { isOverdue } from "@/data/selectors";

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
    // the same amounts as the lists (agreed with the list-cards chat): what the client signed, not the estimate total
    signedCents: signedList.reduce((s, e) => s + estimateListAmount(e).cents, 0),
    receivedCents: pays.reduce((s, x) => s + x.amountCents, 0),
    payments: pays.length,
    awaitingCents: db.invoices.reduce((s, i) => s + invoiceBalance(i).owesCents, 0),
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
      return { ...none, invoices: db.invoices.filter((i) => invoiceBalance(i).owesCents > 0).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")) };
  }
}

/* ---- spec 24 A: the «Получено» card — money by days / weeks of the period, the previous period, open invoices ---- */

export interface Bucket {
  /** first day of the bucket (a day or a week of the month) */
  from: DayKey;
  to: DayKey;
  cents: number;
  /** the bucket with today in it */
  current: boolean;
  /** all of it is after today (only the track is drawn) */
  future: boolean;
}

/** received money, integer cents, through the engine (rule 8): net of refunds, never below 0 */
const receivedIn = (db: Pick<DB, "payments">, r: { from: DayKey; to: DayKey }) => clientMoney([], db.payments.filter((x) => inRange(x.at, r)).map((x) => x.amountCents)).paidTotalCents;

/**
 * Columns of the «Получено» chart (spec 24 A3): «Сегодня» — the last 7 days (today on the right);
 * «Неделя» — Mon…Sun of this week; «Месяц» — weeks of the month 1–7, 8–14, 15–21, 22–28, 29–end.
 * Days are the company's calendar days (isoDayKey).
 */
export function receivedBuckets(db: Pick<DB, "payments">, p: Period, today: DayKey = todayKey()): Bucket[] {
  const day = (k: DayKey): Bucket => ({ from: k, to: k, cents: receivedIn(db, { from: k, to: k }), current: k === today, future: k > today });
  if (p === "today") return Array.from({ length: 7 }, (_, i) => day(addDays(today, i - 6)));
  if (p === "week") return Array.from({ length: 7 }, (_, i) => day(addDays(weekStart(today), i)));
  const { from, to } = periodRange("month", today);
  const out: Bucket[] = [];
  for (let k = from; k <= to; k = addDays(k, 7)) {
    const end = addDays(k, 6) < to ? addDays(k, 6) : to;
    out.push({ from: k, to: end, cents: receivedIn(db, { from: k, to: end }), current: today >= k && today <= end, future: k > today });
  }
  return out;
}

/** the same span one period back: yesterday / last week / last month (for «▲ $420 к прошлой неделе») */
export function prevPeriodRange(p: Period, today: DayKey = todayKey()): { from: DayKey; to: DayKey } {
  if (p === "today") return periodRange("today", addDays(today, -1));
  if (p === "week") return periodRange("week", addDays(weekStart(today), -7));
  return periodRange("month", addMonths(`${today.slice(0, 8)}01`, -1));
}
export const prevReceivedCents = (db: Pick<DB, "payments">, p: Period, today: DayKey = todayKey()): number => receivedIn(db, prevPeriodRange(p, today));

/** «Ждёт оплаты»: how many invoices are open and how many of them are overdue (company days) */
export function awaitingCounts(db: Pick<DB, "invoices">, now: number = Date.now()): { open: number; overdue: number } {
  const open = db.invoices.filter((i) => invoiceBalance(i).owesCents > 0);
  return { open: open.length, overdue: open.filter((i) => !!i.dueDate && isOverdue(i.dueDate, now)).length };
}

/** a funnel step's share of the step before, shown only when it means something: base > 0 and ≤ 100 % (24 A3) */
export const funnelShare = (part: number, base: number): number | undefined => (base > 0 && part <= base ? pct(part, base) : undefined);
