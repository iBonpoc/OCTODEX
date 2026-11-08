/**
 * Money lists of wave 8 (docs/specs/18-money-reports.md §7): «Счета» with the one path to debts, and «Оплаты» for a period.
 * Every sum goes through @octo/estimating-engine (rule 8); days are the company's (zone.ts), never the phone's.
 * Unit-tested in test/moneyLists.test.ts.
 */
import { sumCents, totalsBy, type CentsTotal } from "@octo/estimating-engine";
import type { DB, Expense, Invoice, Payment, PaymentMethod, Role } from "@/data/types";
import { invoiceBalance } from "./invoiceStatus";
import { collectedPayments } from "./payments/collected";
import { periodRange, type Period } from "./metrics";
import { todayKey, type DayKey } from "./calendar";
import { dayKeyIn, daysBetween, dueDayKey, getZone } from "./zone";

/** who opens the lists (13 §4): «Счета» — not the tech (he opens the invoice of his own job); «Оплаты» — owner, admin, office */
export const canSeeInvoiceList = (role: Role) => role !== "tech";
export const canSeePayments = (role: Role) => role === "director" || role === "dispatcher";

/** chips of «Счета»: owed = not paid · overdue (the default — the one path to debts), paid, all */
export type InvoiceFilter = "owed" | "paid" | "all";
export const INVOICE_FILTERS: readonly InvoiceFilter[] = ["owed", "paid", "all"];
export const asInvoiceFilter = (x: unknown): InvoiceFilter => (INVOICE_FILTERS as readonly unknown[]).includes(x) ? (x as InvoiceFilter) : "owed";

/** groups of the list: overdue (bad) → waiting (info) → paid (ok) */
export type OwedGroup = "overdue" | "waiting" | "paid";
export const OWED_GROUPS: readonly OwedGroup[] = ["overdue", "waiting", "paid"];

/** calendar days past the due day, in the company's zone (> 0 = overdue; the same rule as listSigns.invoiceSigns) */
export function daysOverdue(i: Pick<Invoice, "dueDate">, now: number = Date.now(), tz: string = getZone()): number {
  if (!i.dueDate) return 0;
  return daysBetween(dueDayKey(i.dueDate, tz), dayKeyIn(now, tz));
}

export function owedGroup(i: Pick<Invoice, "totalCents" | "paidCents" | "dueDate">, now: number = Date.now(), tz?: string): OwedGroup {
  if (invoiceBalance(i).owesCents === 0) return "paid";
  return daysOverdue(i, now, tz) > 0 ? "overdue" : "waiting";
}

export interface InvoiceListView {
  counts: Record<InvoiceFilter, number>;
  /** what is left to pay on the invoices in «owed» (= «Ждёт оплаты» on Today when no client is chosen) */
  owedCents: number;
  groups: { g: OwedGroup; items: Invoice[]; cents: number }[];
}

/**
 * The invoices of a filter, optionally of one client («Должен» on the client opens it).
 * Overdue and waiting — oldest due first; paid — newest payment first. A group's sum: owed for open ones, paid for paid ones.
 */
export function invoiceList(db: Pick<DB, "invoices">, f: InvoiceFilter, opts: { customerId?: string; now?: number; tz?: string } = {}): InvoiceListView {
  const now = opts.now ?? Date.now();
  const mine = db.invoices.filter((i) => !opts.customerId || i.customerId === opts.customerId);
  const withG = mine.map((i) => ({ i, g: owedGroup(i, now, opts.tz) }));
  const inF = (g: OwedGroup, x: InvoiceFilter) => x === "all" || (x === "paid" ? g === "paid" : g !== "paid");
  const counts = { owed: 0, paid: 0, all: 0 } as Record<InvoiceFilter, number>;
  for (const x of INVOICE_FILTERS) counts[x] = withG.filter(({ g }) => inF(g, x)).length;
  const owedCents = sumCents(withG.filter(({ g }) => g !== "paid").map(({ i }) => invoiceBalance(i).owesCents));
  const groups = OWED_GROUPS.filter((g) => inF(g, f))
    .map((g) => {
      const items = withG.filter((x) => x.g === g).map((x) => x.i);
      items.sort(g === "paid" ? (a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate) : (a, b) => dueDayKey(a.dueDate).localeCompare(dueDayKey(b.dueDate)));
      const cents = sumCents(items.map((i) => (g === "paid" ? i.paidCents : invoiceBalance(i).owesCents)));
      return { g, items, cents };
    })
    .filter((x) => x.items.length > 0);
  return { counts, owedCents, groups };
}

/** «Оплаты»: periods as on Today, plus «all» */
export type PaymentPeriod = Period | "all";
export const PAYMENT_PERIODS: readonly PaymentPeriod[] = ["today", "week", "month", "all"];
export const asPaymentPeriod = (x: unknown): PaymentPeriod => (PAYMENT_PERIODS as readonly unknown[]).includes(x) ? (x as PaymentPeriod) : "month";

export interface PaymentsView {
  items: Payment[];
  totalCents: number;
  /** by method in the period (before the method filter), biggest first — chips with sums */
  byMethod: CentsTotal<PaymentMethod>[];
}

/** payments of a period (by the company's day of the payment), newest first; method filter after the totals by method */
export function paymentsIn(db: Pick<DB, "payments" | "advances">, p: PaymentPeriod, method?: PaymentMethod, today: DayKey = todayKey()): PaymentsView {
  const r = p === "all" ? null : periodRange(p, today);
  // advances (no invoice) only when they count as collected (payments/collected.ts — one switch, spec 35 §4г)
  const inP = collectedPayments(db).filter((x) => {
    if (!r) return true;
    const k = dayKeyIn(x.at);
    return k >= r.from && k <= r.to;
  });
  const items = inP.filter((x) => !method || x.method === method).sort((a, b) => b.at.localeCompare(a.at));
  return {
    items,
    totalCents: sumCents(items.map((x) => x.amountCents)),
    byMethod: totalsBy(inP.map((x) => ({ key: x.method, cents: x.amountCents }))),
  };
}

/** the search of «Расходы» (spec 31, one rule): the vendor, the category (its word), the work and its client, who paid */
export function matchExpense(db: Pick<DB, "jobs" | "customers" | "properties" | "members">, x: Expense, q: string, categoryWord = ""): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const job = x.jobId ? db.jobs.find((j) => j.id === x.jobId) : undefined;
  const client = job ? db.customers.find((c) => c.id === db.properties.find((p) => p.id === job.propertyId)?.customerId) : undefined;
  const who = db.members.find((m) => m.id === x.memberId)?.name;
  return [x.vendor, categoryWord, job?.title, client?.name, who].some((w) => (w ?? "").toLowerCase().includes(needle));
}
