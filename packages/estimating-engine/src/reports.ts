/**
 * Reports and money lists (wave 8, docs/specs/18-money-reports.md §5; map S14). Integer cents only.
 * The app passes plain numbers and day counts — no dates or zones here (the day is decided by the app, in the company's zone).
 */

function assertCents(c: number): void {
  if (!Number.isSafeInteger(c)) throw new Error(`not integer cents: ${c}`);
}

/** Σ integer cents; throws on a fraction (a float sum is a bug, rule 8) */
export function sumCents(xs: readonly number[]): number {
  let s = 0;
  for (const c of xs) {
    assertCents(c);
    s += c;
  }
  assertCents(s);
  return s;
}

export interface CentsTotal<K extends string> {
  key: K;
  cents: number;
  count: number;
}

/** totals by a key, biggest first (ties: by key, so the order never jumps) */
export function totalsBy<K extends string>(items: readonly { key: K; cents: number }[]): CentsTotal<K>[] {
  const m = new Map<K, CentsTotal<K>>();
  for (const { key, cents } of items) {
    assertCents(cents);
    const t = m.get(key) ?? { key, cents: 0, count: 0 };
    t.cents += cents;
    t.count += 1;
    m.set(key, t);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** «Кто должен» buckets: not overdue, 1–30, 31–60, 61–90, 90+ days past due */
export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90p";
export const AGING_BUCKETS: readonly AgingBucket[] = ["current", "d1_30", "d31_60", "d61_90", "d90p"];
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90p";
}

export interface OwedInvoice {
  customerId: string;
  totalCents: number;
  paidCents: number;
  /** calendar days past the due day in the company's zone; ≤ 0 = not overdue */
  daysOverdue: number;
}
export interface OwedRow {
  customerId: string;
  owesCents: number;
  overdueCents: number;
  /** the oldest overdue invoice, days (0 = nothing overdue) */
  maxDaysOverdue: number;
  invoices: number;
  buckets: Record<AgingBucket, number>;
}

/** «Кто должен» by client: what is left to pay (never below 0 per invoice — an overpayment owes nothing), by age; biggest debt first */
export function owedByClient(invoices: readonly OwedInvoice[]): OwedRow[] {
  const m = new Map<string, OwedRow>();
  for (const i of invoices) {
    assertCents(i.totalCents);
    assertCents(i.paidCents);
    const owes = Math.max(0, i.totalCents - i.paidCents);
    if (owes === 0) continue;
    const r =
      m.get(i.customerId) ??
      { customerId: i.customerId, owesCents: 0, overdueCents: 0, maxDaysOverdue: 0, invoices: 0, buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 } };
    r.owesCents += owes;
    r.invoices += 1;
    r.buckets[agingBucket(i.daysOverdue)] += owes;
    if (i.daysOverdue > 0) {
      r.overdueCents += owes;
      r.maxDaysOverdue = Math.max(r.maxDaysOverdue, i.daysOverdue);
    }
    m.set(i.customerId, r);
  }
  return [...m.values()].sort((a, b) => b.owesCents - a.owesCents || (a.customerId < b.customerId ? -1 : 1));
}

export interface FunnelEstimate {
  /** sent in the period */
  sent: boolean;
  /** signed (approved) in the period */
  signed: boolean;
  /** Estimate value — what the client chose (PRD 14 §7), counted only when signed */
  cents: number;
}
export interface SalesFunnel {
  sent: number;
  signed: number;
  signedCents: number;
  /** signed / sent, whole %, half up; 0 when nothing was sent */
  signedPct: number;
}
/** «Продажи»: estimates sent, signed, the signed value, the share (S14) */
export function salesFunnel(xs: readonly FunnelEstimate[]): SalesFunnel {
  const sent = xs.filter((x) => x.sent).length;
  const signedList = xs.filter((x) => x.signed);
  const signed = signedList.length;
  return {
    sent,
    signed,
    signedCents: sumCents(signedList.map((x) => x.cents)),
    signedPct: sent > 0 ? Math.floor((signed * 200 + sent) / (2 * sent)) : 0,
  };
}

/** cents → "1840.50" for CSV (a spreadsheet reads a plain decimal; no "$", no thousands separators) */
export function centsToDecimal(c: number): string {
  assertCents(c);
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** a / b, whole, half up (b > 0); for cents and for % (×100 by the caller) */
function divHalfUp(a: number, b: number): number {
  const s = a < 0 ? -1 : 1;
  return s * Math.floor((Math.abs(a) * 2 + b) / (2 * b));
}

/**
 * «По направлениям» (step 12б, docs/specs/18-money-reports.md §11; spec 11 T4). The app picks what fell in the period and the
 * direction of each record (an invoice — through its job); the engine counts. One fact per record.
 */
export type CategoryFact =
  /** a lead received in the period; won = became a client */
  | { kind: "lead"; key: string; won: boolean }
  /** an estimate sent and/or signed in the period; cents = the signed value (0 unless signed) */
  | { kind: "estimate"; key: string; sent: boolean; signed: boolean; cents: number }
  /** an invoice sent in the period; cents = before tax (Revenue, PRD 14 §7) */
  | { kind: "invoice"; key: string; jobId: string; cents: number };
export interface CategoryRow {
  key: string;
  leads: number;
  won: number;
  /** won / leads, whole %, half up; 0 when no leads */
  wonPct: number;
  sent: number;
  signed: number;
  signedCents: number;
  /** distinct jobs with an invoice in the period */
  jobs: number;
  invoices: number;
  revenueCents: number;
  /** revenue / jobs, to the cent, half up; 0 when no jobs */
  avgCents: number;
}
const emptyRow = (key: string): CategoryRow => ({ key, leads: 0, won: 0, wonPct: 0, sent: 0, signed: 0, signedCents: 0, jobs: 0, invoices: 0, revenueCents: 0, avgCents: 0 });

/** rows by direction (biggest revenue first, then most leads, then key; `noneKey` — «без направления» — always last) and the total */
export function categoryTotals(facts: readonly CategoryFact[], noneKey: string): { rows: CategoryRow[]; total: CategoryRow } {
  const m = new Map<string, CategoryRow>();
  const jobs = new Map<string, Set<string>>();
  const allJobs = new Set<string>();
  const total = emptyRow("");
  for (const f of facts) {
    const r = m.get(f.key) ?? emptyRow(f.key);
    for (const x of [r, total]) {
      if (f.kind === "lead") {
        x.leads += 1;
        if (f.won) x.won += 1;
      } else if (f.kind === "estimate") {
        assertCents(f.cents);
        if (f.sent) x.sent += 1;
        if (f.signed) {
          x.signed += 1;
          x.signedCents += f.cents;
        }
      } else {
        assertCents(f.cents);
        x.invoices += 1;
        x.revenueCents += f.cents;
      }
    }
    if (f.kind === "invoice") {
      const s = jobs.get(f.key) ?? new Set<string>();
      s.add(f.jobId);
      jobs.set(f.key, s);
      allJobs.add(f.jobId);
    }
    m.set(f.key, r);
  }
  const finish = (x: CategoryRow, nJobs: number) => {
    assertCents(x.revenueCents);
    assertCents(x.signedCents);
    x.jobs = nJobs;
    x.wonPct = x.leads > 0 ? divHalfUp(x.won * 100, x.leads) : 0;
    x.avgCents = nJobs > 0 ? divHalfUp(x.revenueCents, nJobs) : 0;
    return x;
  };
  const rows = [...m.values()]
    .map((r) => finish(r, jobs.get(r.key)?.size ?? 0))
    .sort((a, b) =>
      (a.key === noneKey ? 1 : 0) - (b.key === noneKey ? 1 : 0) ||
      b.revenueCents - a.revenueCents ||
      b.leads - a.leads ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
  return { rows, total: finish(total, allJobs.size) };
}
