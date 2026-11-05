/**
 * Signing an estimate, as pure functions over the data (docs/specs/07 §2.2 А, §4; story map S8 / S8b).
 * The store calls these; the server does the same in portal_accept / countersign_estimate (migration 20261105240000).
 *
 *   S8  the client signs (page or on site)  → awaiting_countersign; no job, no invoice, the lead is not won yet.
 *   S8b an employee signs for the company   → approved; lead won, client active, job "waiting for a date", deposit invoice.
 * Founder 05.11: the deal counts only when both signed; every employee may sign in their own name; no auto-signing.
 */
import type { DB, Estimate, EstimateApproval, EstimateCountersign, ID, Member } from "@/data/types";
import { summarize } from "./estimateDoc";

/** The client's signature (S8). Repeating it changes nothing. */
export function clientSigned(d: DB, id: ID, a: Omit<EstimateApproval, "at" | "totalCents" | "depositCents">, ids: { jobId: ID; invoiceId: ID }, now: string, token: string): DB {
  const e = d.estimates.find((x) => x.id === id);
  if (!e?.doc || e.status === "awaiting_countersign" || e.status === "approved") return d;
  const sum = summarize(e.doc, a);
  const approval: EstimateApproval = { ...a, at: now, totalCents: sum.totalCents, depositCents: sum.depositCents, jobId: ids.jobId, invoiceId: ids.invoiceId };
  return {
    ...d,
    estimates: d.estimates.map((x) =>
      x.id === id ? { ...x, ...sum, token, status: "awaiting_countersign", approval, signature: a.signature, sentAt: x.sentAt ?? now } : x,
    ),
  };
}

/** Who may sign for the company: an active employee (not a subcontractor) whose right was not taken away. */
export function canCountersign(d: Pick<DB, "members">, userId: ID): boolean {
  const m = d.members.find((x) => x.id === userId);
  return !!m && m.kind === "employee" && !m.pending && m.canSignContracts !== false;
}

/**
 * California: a contract is negotiated and signed for the contractor by the owner or a registered home improvement
 * salesperson (HIS, B&P §7152). Without the number: a warning, never a block (founder 05.11).
 */
export function hisWarning(d: Pick<DB, "members" | "company">, userId: ID): boolean {
  const m = d.members.find((x) => x.id === userId);
  if (!m || d.company?.address.state?.toUpperCase() !== "CA") return false;
  return !m.roles.includes("director") && !m.hisNumber?.trim();
}

/** a closed lead is not won by a signature (the same set as the server: won, lost, declined; archived is a flag) */
const CLOSED_LEAD = ["won", "lost", "declined"];

/** Who may revoke a client link or reopen a client-signed estimate: director and office (server: owner / admin / office). */
export function canManageLink(d: Pick<DB, "members">, userId: ID): boolean {
  const m = d.members.find((x) => x.id === userId);
  return !!m && (m.roles.includes("director") || m.roles.includes("dispatcher"));
}

/** The company's signature (S8b): one function for the whole deal. Repeating it changes nothing. */
export function companySigned(
  d: DB,
  id: ID,
  by: { userId: ID; signature: string; method: EstimateCountersign["method"] },
  /** the same ids the server will use (sent with the op): the job and the deposit invoice */
  ids: { jobId: ID; invoiceId: ID },
  now: string,
  invoiceNumber?: (d: DB) => string | undefined,
): DB {
  const e = d.estimates.find((x) => x.id === id);
  if (!e || e.status !== "awaiting_countersign" || !canCountersign(d, by.userId)) return d;
  const m = d.members.find((x) => x.id === by.userId)!;
  const countersign: EstimateCountersign = { userId: m.id, signerName: m.name, signerTitle: m.title, his: m.hisNumber, signature: by.signature, at: now, method: by.method };
  const a = e.approval;
  const total = a?.totalCents ?? e.totalCents;
  const deposit = a?.depositCents ?? e.depositCents ?? 0;
  const existingJob = d.jobs.find((j) => j.estimateId === id);
  const jobId = existingJob?.id ?? ids.jobId;
  // like the server (app.execute_estimate): a job and the deposit invoice also for a quick estimate signed on site
  const needDeposit = deposit > 0 && !d.invoices.some((i) => i.jobId === jobId && i.kind === "deposit");
  const customer = d.customers.find((c) => c.id === e.customerId);
  const next: Estimate = { ...e, status: "approved", countersign, approvedAt: now };
  return {
    ...d,
    estimates: d.estimates.map((x) => (x.id === id ? next : x)),
    // the job takes the estimate's direction of the business (docs/specs/11-trade.md S16; the server trigger does the same)
    jobs: existingJob ? d.jobs : [...d.jobs, { id: jobId, propertyId: e.propertyId, title: e.title, status: "unscheduled", amountCents: total, estimateId: id, serviceCategoryId: e.serviceCategoryId }],
    leads: e.leadId
      ? d.leads.map((l) => (l.id === e.leadId && !CLOSED_LEAD.includes(l.status) ? { ...l, status: "won", wonVia: "approval", lastActivityAt: now } : l))
      : d.leads,
    customers: d.customers.map((c) => (c.id === e.customerId && c.status === "prospect" ? { ...c, status: "active" } : c)),
    invoices: needDeposit
      ? [
          ...d.invoices,
          {
            id: ids.invoiceId, customerId: e.customerId, jobId, kind: "deposit", title: "Deposit", totalCents: deposit, paidCents: 0,
            dueDate: now, sentAt: now, number: invoiceNumber?.(d),
          },
        ]
      : d.invoices,
    notices: [
      { id: `ntc-${id}-approved`, kind: "estimate.approved", estimateId: id, jobId, customer: customer?.name ?? a?.signerName ?? "", totalCents: total, depositCents: deposit, at: now, read: true },
      ...d.notices.filter((n) => n.id !== `ntc-${id}-approved`),
    ],
  };
}

/** "Valid until" for a send today: the company's days, 7 by default (founder 05.11). Local calendar day, YYYY-MM-DD. */
export function validUntilFor(company: Pick<NonNullable<DB["company"]>, "estimate"> | null, now: Date): string {
  const days = Math.max(1, company?.estimate.validDays ?? 7);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The client link is open: not revoked, and signed (by the client or both) or not past "valid until" — the limit is for an unsigned estimate. */
export function linkOpen(e: Pick<Estimate, "status" | "validUntil" | "linkRevokedAt" | "token">, now: Date): boolean {
  if (!e.token || e.linkRevokedAt) return false;
  if (e.status === "approved" || e.status === "awaiting_countersign" || !e.validUntil) return true;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return e.validUntil >= today;
}

/** The current saved signature of an employee. */
export function mySignature(d: Pick<DB, "memberSignatures">, userId: ID) {
  return (d.memberSignatures ?? []).find((s) => s.userId === userId && !s.revokedAt);
}
