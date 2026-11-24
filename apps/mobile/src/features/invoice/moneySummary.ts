/**
 * «Деньги» of prototype v2 (#2350, BUILD-SPEC §2.9, §2.10, §2.13; DESIGN.md «плитки 2×2 с пастелью»): the four tiles over the
 * three lists — «Ждёт оплаты · Просрочено · Получено · Ещё выставить» — and the main step of an invoice by its state.
 * Pure; every sum goes through @octo/estimating-engine (rule 8), days are the company's (moneyLists / zone), never the phone's.
 * Unit-tested in test/moneySummary.test.ts.
 */
import { contractStatement, sumCents } from "@octo/estimating-engine";
import type { DB, Invoice } from "@/data/types";
import { isContractKind } from "@/features/contractKind";
import { invoiceBalance } from "@/features/invoiceStatus";
import { owedGroup, paymentsIn } from "@/features/moneyLists";
import type { DayKey } from "@/features/calendar";

/** a tile: the sum and how many records make it */
export type Figure = { cents: number; n: number };

/** the tiles' keys: «Ждёт оплаты» (not due yet), «Просрочено», «Получено» (this month), «Ещё выставить» (contracts − invoiced) */
export type MoneyTile = "waiting" | "overdue" | "received" | "toBill";
export const MONEY_TILES: readonly MoneyTile[] = ["waiting", "overdue", "received", "toBill"];

export type MoneySummary = Record<MoneyTile, Figure>;

/**
 * The four figures. «Ждёт оплаты» and «Просрочено» split what is owed on live invoices (never counted twice: their sum is
 * «Должны» of the old screen); «Получено» — the month's payments as «Оплаты» counts them; «Ещё выставить» — the contract of each
 * live job less what its contract invoices (deposit · progress · final) already bill, as attention.ts and the job's statement.
 */
export function moneySummary(db: Pick<DB, "invoices" | "payments" | "advances" | "jobs">, opts: { now?: number; tz?: string; today?: DayKey } = {}): MoneySummary {
  const now = opts.now ?? Date.now();
  const open = db.invoices.map((i) => ({ i, g: owedGroup(i, now, opts.tz) })).filter((x) => x.g !== "paid");
  const of = (g: "waiting" | "overdue") => {
    const xs = open.filter((x) => x.g === g).map((x) => invoiceBalance(x.i).owesCents);
    return { cents: sumCents(xs), n: xs.length };
  };
  const month = paymentsIn(db, "month", undefined, opts.today);
  const byJob = new Map<string, Invoice[]>();
  for (const i of db.invoices) if (i.jobId && isContractKind(i.kind)) byJob.set(i.jobId, [...(byJob.get(i.jobId) ?? []), i]);
  const left = db.jobs
    .filter((j) => Number.isFinite(j.amountCents) && j.amountCents > 0)
    .map((j) => contractStatement(j.amountCents, byJob.get(j.id) ?? []).toInvoice)
    .filter((c) => c > 0);
  return {
    waiting: of("waiting"),
    overdue: of("overdue"),
    received: { cents: month.totalCents, n: month.items.length },
    toBill: { cents: sumCents(left), n: left.length },
  };
}

/** the main step of an invoice (object-cards «Счёт»: состояние → главная кнопка) */
export type InvoiceStep = "send" | "pay" | "remind" | "none";

/**
 * not sent → «Отправить» (the office; the tech takes the payment on site and does not send); sent and not due → «Принять оплату»;
 * overdue → «Напомнить» (the office; the tech — «Принять оплату»); paid → no button. One step, never two (П2).
 */
export function invoiceStep(
  inv: Pick<Invoice, "totalCents" | "paidCents" | "dueDate" | "sentAt">,
  can: { send: boolean; remind: boolean; pay: boolean },
  now: number = Date.now(),
  tz?: string,
): InvoiceStep {
  if (invoiceBalance(inv).owesCents <= 0) return "none";
  if (!inv.sentAt && can.send) return "send";
  if (owedGroup(inv, now, tz) === "overdue" && can.remind) return "remind";
  return can.pay ? "pay" : can.remind ? "remind" : "none";
}

/** «Напомнить всем · N»: the overdue invoices whose client can be written to (a phone or an email), oldest due first */
export function remindAll<I extends Pick<Invoice, "id" | "customerId" | "totalCents" | "paidCents" | "dueDate">>(
  invoices: I[],
  reachable: (customerId: string) => boolean,
  now: number = Date.now(),
  tz?: string,
): I[] {
  return invoices.filter((i) => owedGroup(i, now, tz) === "overdue" && reachable(i.customerId));
}

/** the initials of a row's lead (36): «David Kim» → «DK», one word → its first letter, nothing → «·» */
export function initialsOf(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") : "·";
}
