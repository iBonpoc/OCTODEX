/**
 * «Деньги» — the overview of the tab (visual-v2 «Макеты 390 × 844» №6, образец №3 «Overview»): the yellow tile «Должны · счета»
 * beside «Сметы открыты», three small ones «Сегодня · Расходы, нед. · Задатки», then «К оплате» (the live invoices, the nearest
 * due first) and «Оплачены сегодня». The lists themselves («Сметы · Счета · Оплаты») are behind «Все ›» and the tiles.
 * Pure; every sum through @octo/estimating-engine (rule 8), the days are the company's (zone / moneyLists), never the phone's.
 * Unit-tested in test/moneyOverview.test.ts.
 */
import { sumCents } from "@octo/estimating-engine";
import type { DB, Estimate, Invoice, Payment } from "@/data/types";
import type { DayKey } from "@/features/calendar";
import { estimateListAmount } from "@/features/estimateDoc";
import { invoiceBalance } from "@/features/invoiceStatus";
import { estimateGroup } from "@/features/listGroups";
import { periodRange } from "@/features/metrics";
import { daysOverdue, owedGroup, paymentsIn } from "@/features/moneyLists";
import { dayKeyIn } from "@/features/zone";

/** a figure of a tile: the sum and how many records make it */
export type Fig = { cents: number; n: number };

/** a live invoice of «К оплате»: what is left on it and the days to its due day (< 0 — overdue by that many) */
export type ToPay = { inv: Invoice; owesCents: number; dueIn: number };

export interface MoneyOverview {
  /** «Должны · счета»: what is left on the live invoices; `overdue` — how many of them are past due */
  owed: Fig & { overdue: number };
  /** «Сметы открыты»: the estimates still in work (not approved, declined or closed); `waiting` — sent, the client's turn */
  estimates: Fig & { waiting: number };
  /** «Сегодня»: what came in on the company's day */
  today: Fig;
  /** «Расходы, нед.»: the expenses of the company's week */
  expensesWeek: Fig;
  /** «Задатки»: the payments of deposit invoices this month */
  deposits: Fig;
  /** «К оплате»: overdue first (the oldest), then by the due day */
  toPay: ToPay[];
  /** «Оплачены сегодня»: newest first */
  paidToday: Payment[];
}

export function moneyOverview(
  db: Pick<DB, "invoices" | "payments" | "advances" | "expenses">,
  estimates: readonly Pick<Estimate, "status" | "sentAt" | "doc" | "approval" | "totalCents">[],
  opts: { now?: number; tz?: string; today?: DayKey } = {},
): MoneyOverview {
  const now = opts.now ?? Date.now();
  const live = db.invoices.filter((i) => owedGroup(i, now, opts.tz) !== "paid");
  const toPay = live
    .map((inv) => ({ inv, owesCents: invoiceBalance(inv).owesCents, dueIn: 0 - daysOverdue(inv, now, opts.tz) || 0 }))
    .sort((a, b) => a.dueIn - b.dueIn || a.inv.dueDate.localeCompare(b.inv.dueDate));
  const open = estimates.filter((e) => estimateGroup(e, now) !== "done");
  const today = paymentsIn(db, "today", undefined, opts.today);
  const month = paymentsIn(db, "month", undefined, opts.today);
  const kindOf = new Map(db.invoices.map((i) => [i.id, i.kind] as const));
  const deposits = month.items.filter((x) => "invoiceId" in x && kindOf.get(x.invoiceId) === "deposit");
  const week = opts.today ? periodRange("week", opts.today) : periodRange("week");
  const spent = db.expenses.filter((x) => {
    const k = dayKeyIn(x.at, opts.tz);
    return k >= week.from && k <= week.to;
  });
  return {
    owed: { cents: sumCents(toPay.map((x) => x.owesCents)), n: toPay.length, overdue: toPay.filter((x) => x.dueIn < 0).length },
    estimates: { cents: sumCents(open.map((e) => estimateListAmount(e).cents)), n: open.length, waiting: open.filter((e) => e.status === "sent").length },
    today: { cents: today.totalCents, n: today.items.length },
    expensesWeek: { cents: sumCents(spent.map((x) => x.amountCents)), n: spent.length },
    deposits: { cents: sumCents(deposits.map((x) => x.amountCents)), n: deposits.length },
    toPay,
    paidToday: today.items.filter((x): x is Payment => "invoiceId" in x),
  };
}

/** «Срок» of a row: «−9 дн» (overdue, the bad word), «сегодня», «3 дн» */
export function dueWord(dueIn: number): { key: "w2m.due.late" | "w2m.due.today" | "w2m.due.in"; d: number; late: boolean } {
  if (dueIn < 0) return { key: "w2m.due.late", d: -dueIn, late: true };
  if (dueIn === 0) return { key: "w2m.due.today", d: 0, late: false };
  return { key: "w2m.due.in", d: dueIn, late: false };
}
