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
