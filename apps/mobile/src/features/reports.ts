/**
 * Reports v1 (wave 8, docs/specs/18-money-reports.md §5; 13 §3.15; map S14). The app picks the records and the company's days;
 * every sum is the engine's (rule 8). Unit-tested in test/reports.test.ts.
 */
import { centsToDecimal, owedByClient, salesFunnel, sumCents, totalsBy, type CentsTotal, type OwedRow, type SalesFunnel } from "@octo/estimating-engine";
import type { DB, Invoice, PaymentMethod, Role } from "@/data/types";
import { estimateListAmount } from "./estimateDoc";
import { periodRange } from "./metrics";
import { daysOverdue, paymentsIn, type PaymentPeriod } from "./moneyLists";
import { todayKey, type DayKey } from "./calendar";
import { dayKeyIn } from "./zone";

export type ReportId = "owed" | "collected" | "sales" | "sources";
export const REPORTS: readonly ReportId[] = ["owed", "collected", "sales", "sources"];
export const asReport = (x: unknown): ReportId | undefined => ((REPORTS as readonly unknown[]).includes(x) ? (x as ReportId) : undefined);

/** Reports: owner, admin, office (office only looks, 13 §4); not sales, not the tech */
export const canSeeReports = (role: Role) => role === "director" || role === "dispatcher";
/** CSV export — the owner only (13 §3.15: by the database role owner, not by «director», which is owner and admin) */
export const canExportCsv = (db: Pick<DB, "members" | "me">, role: Role) => role === "director" && !!db.members.find((m) => m.id === db.me)?.isOwner;

const inPeriod = (iso: string | undefined, p: PaymentPeriod, today: DayKey) => {
  if (!iso) return false;
  if (p === "all") return true;
  const r = periodRange(p, today);
  const k = dayKeyIn(iso);
  return k >= r.from && k <= r.to;
};

/** 1. «Кто должен» — not tied to a period: what is owed now, by client, by age (days of the company) */
export function owedReport(db: Pick<DB, "invoices">, now: number = Date.now()): { rows: OwedRow[]; owesCents: number; overdueCents: number } {
  const rows = owedByClient(db.invoices.map((i) => ({ customerId: i.customerId, totalCents: i.totalCents, paidCents: i.paidCents, daysOverdue: daysOverdue(i, now) })));
  return { rows, owesCents: sumCents(rows.map((r) => r.owesCents)), overdueCents: sumCents(rows.map((r) => r.overdueCents)) };
}

/** who took a payment that has no person (demo, old rows) */
export const UNKNOWN = "unknown";
/** 2. «Собрано за период» — Cash collected (PRD 14 §7): net of refunds, by method and by person */
export function collectedReport(db: Pick<DB, "payments">, p: PaymentPeriod, today: DayKey = todayKey()): { totalCents: number; count: number; byMethod: CentsTotal<PaymentMethod>[]; byPerson: CentsTotal<string>[] } {
  const v = paymentsIn(db, p, undefined, today);
  return { totalCents: v.totalCents, count: v.items.length, byMethod: v.byMethod, byPerson: totalsBy(v.items.map((x) => ({ key: x.receivedBy ?? UNKNOWN, cents: x.amountCents }))) };
}

/** 3. «Продажи» — sent / signed in the period, the signed value = what the client chose (the same amount as Today and the lists) */
export function salesReport(db: Pick<DB, "estimates">, p: PaymentPeriod, today: DayKey = todayKey()): SalesFunnel {
  return salesFunnel(
    db.estimates.map((e) => {
      const signed = e.status === "approved" && inPeriod(e.approvedAt, p, today);
      return { sent: inPeriod(e.sentAt, p, today), signed, cents: signed ? estimateListAmount(e).cents : 0 };
    }),
  );
}

/** the source key of «Повторный клиент» (no lead and not the client's first invoiced job) */
export const REPEAT = "repeat";
/**
 * The source of an invoice (PRD 14 §7): job → estimate → lead → source; no lead → the client's source if this is the client's
 * first invoiced job, else «repeat».
 */
export function invoiceSource(db: Pick<DB, "jobs" | "estimates" | "leads" | "customers" | "invoices">, i: Invoice): string {
  const job = db.jobs.find((j) => j.id === i.jobId);
  const est = job?.estimateId ? db.estimates.find((e) => e.id === job.estimateId) : undefined;
  const lead = est?.leadId ? db.leads.find((l) => l.id === est.leadId) : undefined;
  if (lead?.sourceId) return lead.sourceId;
  const firstJob = db.invoices
    .filter((x) => x.customerId === i.customerId)
    .sort((a, b) => (a.sentAt ?? a.dueDate).localeCompare(b.sentAt ?? b.dueDate))[0]?.jobId;
  if (firstJob !== i.jobId) return REPEAT;
  return db.customers.find((c) => c.id === i.customerId)?.sourceId || REPEAT;
}

/** 4. «Источник лида → выручка» — Revenue (PRD 14 §7): Σ before tax of invoices sent in the period, by source. Not profit. */
export function sourcesReport(db: Pick<DB, "jobs" | "estimates" | "leads" | "customers" | "invoices">, p: PaymentPeriod, today: DayKey = todayKey()): { totalCents: number; rows: CentsTotal<string>[] } {
  const sent = db.invoices.filter((i) => inPeriod(i.sentAt, p, today));
  const rows = totalsBy(sent.map((i) => ({ key: invoiceSource(db, i), cents: i.subtotalCents ?? i.totalCents })));
  return { totalCents: sumCents(rows.map((r) => r.cents)), rows };
}

/** CSV with quotes where needed (RFC 4180); money as plain decimals; the file starts with a BOM so Excel reads UTF-8 */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    // a formula injection guard: a cell starting with = + - @ is read as text
    const safe = /^[=+\-@]/.test(s) && !/^-\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
export const csvMoney = centsToDecimal;
