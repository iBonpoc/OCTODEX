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
import { getZone, minuteIn } from "./zone";

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
    // the same engine path as «Получено» (rule 8, review #270): whole cents, net of refunds
    receivedCents: clientMoney([], pays.map((x) => x.amountCents)).paidTotalCents,
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

/**
 * Received money by company day, built in ONE pass over the payments (24 A5; review #270: no Intl per payment per
 * bucket on every render). A payment's amountCents is already net of its refunds (repo.ts: amount − refunded), and the
 * refund counts on the payment's own day — the day the money came. Each entry keeps the minute of the company's day
 * for «the same span» of the previous period.
 */
export type ReceivedIndex = Map<DayKey, { cents: number; minute: number }[]>;
export function receivedIndex(payments: DB["payments"], tz: string = getZone()): ReceivedIndex {
  const idx: ReceivedIndex = new Map();
  for (const x of payments) {
    if (!x.at) continue;
    const k = isoDayKey(x.at, tz);
    const list = idx.get(k) ?? [];
    list.push({ cents: x.amountCents, minute: minuteIn(x.at, tz) });
    idx.set(k, list);
  }
  return idx;
}

/** the one money path for «Получено» (rule 8): the engine sums whole cents; `untilMinute` cuts the last day */
function receivedSum(idx: ReceivedIndex, from: DayKey, to: DayKey, untilMinute?: number): { cents: number; count: number } {
  const amounts: number[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    for (const e of idx.get(k) ?? []) if (untilMinute === undefined || k < to || e.minute <= untilMinute) amounts.push(e.cents);
  }
  return { cents: clientMoney([], amounts).paidTotalCents, count: amounts.length };
}

/**
 * Columns of the «Получено» chart (spec 24 A3): «Сегодня» — the last 7 days (today on the right);
 * «Неделя» — Mon…Sun of this week; «Месяц» — weeks of the month 1–7, 8–14, 15–21, 22–28, 29–end.
 */
export function receivedBuckets(idx: ReceivedIndex, p: Period, today: DayKey = todayKey()): Bucket[] {
  const day = (k: DayKey): Bucket => ({ from: k, to: k, cents: receivedSum(idx, k, k).cents, current: k === today, future: k > today });
  if (p === "today") return Array.from({ length: 7 }, (_, i) => day(addDays(today, i - 6)));
  if (p === "week") return Array.from({ length: 7 }, (_, i) => day(addDays(weekStart(today), i)));
  const { from, to } = periodRange("month", today);
  const out: Bucket[] = [];
  for (let k = from; k <= to; k = addDays(k, 7)) {
    const end = addDays(k, 6) < to ? addDays(k, 6) : to;
    out.push({ from: k, to: end, cents: receivedSum(idx, k, end).cents, current: today >= k && today <= end, future: k > today });
  }
  return out;
}

/** the period so far: today / this week from Monday / this month from the 1st — through the same engine path */
export function receivedSoFar(idx: ReceivedIndex, p: Period, today: DayKey = todayKey()): { cents: number; count: number } {
  const r = periodRange(p, today);
  return receivedSum(idx, r.from, r.to);
}

/**
 * The SAME span one period back (review #270): yesterday up to this minute; last week Mon … the same weekday up to
 * this minute; last month 1 … the same day (cut to that month's length) up to this minute. Comparing a part of this
 * period with a whole one made Monday mornings and the 1st–5th always «▼».
 */
export function prevPeriodRange(p: Period, today: DayKey = todayKey()): { from: DayKey; to: DayKey; whole?: boolean } {
  if (p === "today") {
    const y = addDays(today, -1);
    return { from: y, to: y };
  }
  if (p === "week") {
    const from = addDays(weekStart(today), -7);
    return { from, to: addDays(today, -7) };
  }
  const from = addMonths(`${today.slice(0, 8)}01`, -1);
  const last = addDays(`${today.slice(0, 8)}01`, -1);
  const same = `${from.slice(0, 8)}${today.slice(8)}`;
  // the 29th–31st against a shorter month: its last day counts whole (there is no «same day» to cut at this minute)
  return same > last ? { from, to: last, whole: true } : { from, to: same };
}
export function prevReceivedCents(idx: ReceivedIndex, p: Period, today: DayKey = todayKey(), nowMinute?: number): number {
  const r = prevPeriodRange(p, today);
  return receivedSum(idx, r.from, r.to, r.whole ? undefined : nowMinute).cents;
}

/** «Ждёт оплаты»: how many invoices are open and how many of them are overdue (company days) */
export function awaitingCounts(db: Pick<DB, "invoices">, now: number = Date.now()): { open: number; overdue: number } {
  const open = db.invoices.filter((i) => invoiceBalance(i).owesCents > 0);
  return { open: open.length, overdue: open.filter((i) => !!i.dueDate && isOverdue(i.dueDate, now)).length };
}

/** a funnel step's share of the step before, shown only when it means something: base > 0 and ≤ 100 % (24 A3) */
export const funnelShare = (part: number, base: number): number | undefined => (base > 0 && part <= base ? pct(part, base) : undefined);
