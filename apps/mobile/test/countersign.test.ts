/**
 * Signing an estimate (docs/specs/07 §2.2 А, §4; story map S8 / S8b; founder 05.11):
 * the client's signature waits for the company's; the deal (lead won, client active, job, deposit) comes only
 * when an employee with the right signs in their own name. Pure functions in src/features/estimateSign.ts.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { canCountersign, canManageLink, clientSigned, companySigned, hisWarning, linkOpen, validUntilFor } from "../src/features/estimateSign";

const NOW = "2026-11-05T18:00:00.000Z";
const IDS = { jobId: "job-new", invoiceId: "inv-new" };

function withEstimate(): { d: DB; id: string } {
  const d = makeSeed();
  const e = d.estimates.find((x) => x.doc && x.status !== "approved")!;
  d.estimates = d.estimates.map((x) => (x.id === e.id ? { ...x, status: "sent", leadId: d.leads[0]?.id, token: "tok" } : x));
  if (d.leads[0]) d.leads = d.leads.map((l, i) => (i === 0 ? { ...l, status: "estimate_sent" } : l));
  d.customers = d.customers.map((c) => (c.id === e.customerId ? { ...c, status: "prospect" } : c));
  d.jobs = d.jobs.filter((j) => j.estimateId !== e.id);
  return { d, id: e.id };
}
const sign = (d: DB, id: string) => {
  const e = d.estimates.find((x) => x.id === id)!;
  return clientSigned(d, id, { optionId: e.doc!.options[0]!.id, addonIds: [], signerName: "Linda Alvarez", signature: "M0 0 L5 5", channel: "portal" }, IDS, NOW, "tok");
};

describe("S8: the client signs → awaiting the company", () => {
  it("status awaiting_countersign; no job, no invoice; the lead is not won; the client stays a prospect", () => {
    const { d, id } = withEstimate();
    const s = sign(d, id);
    const e = s.estimates.find((x) => x.id === id)!;
    expect(e.status).toBe("awaiting_countersign");
    expect(e.approval?.signerName).toBe("Linda Alvarez");
    expect(e.approval?.jobId).toBe("job-new");
    expect(s.jobs.some((j) => j.estimateId === id)).toBe(false);
    expect(s.invoices.length).toBe(d.invoices.length);
    if (e.leadId) expect(s.leads.find((l) => l.id === e.leadId)!.status).toBe("estimate_sent");
    expect(s.customers.find((c) => c.id === e.customerId)!.status).toBe("prospect");
  });
  it("signing again changes nothing", () => {
    const { d, id } = withEstimate();
    const s = sign(d, id);
    expect(sign(s, id)).toBe(s);
  });
});

describe("S8b: an employee signs for the company → the deal", () => {
  it("approved in the employee's own name; lead won, client active, one job waiting for a date, the deposit invoice", () => {
    const { d, id } = withEstimate();
    const s1 = sign(d, id);
    const s2 = companySigned(s1, id, { userId: s1.me, signature: "M1 1", method: "drawn" }, IDS, NOW, () => "INV-0999");
    const e = s2.estimates.find((x) => x.id === id)!;
    const me = s2.members.find((m) => m.id === s2.me)!;
    expect(e.status).toBe("approved");
    expect(e.countersign).toMatchObject({ userId: me.id, signerName: me.name, method: "drawn", at: NOW });
    expect(e.approvedAt).toBe(NOW);
    const jobs = s2.jobs.filter((j) => j.estimateId === id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "job-new", status: "unscheduled", amountCents: e.approval!.totalCents });
    if (e.approval!.depositCents > 0) {
      const dep = s2.invoices.find((i) => i.jobId === "job-new" && i.kind === "deposit")!;
      expect(dep).toMatchObject({ id: "inv-new", totalCents: e.approval!.depositCents, number: "INV-0999" });
    }
    if (e.leadId) expect(s2.leads.find((l) => l.id === e.leadId)).toMatchObject({ status: "won", wonVia: "approval" });
    expect(s2.customers.find((c) => c.id === e.customerId)!.status).toBe("active");
    expect(s2.notices.filter((n) => n.estimateId === id && n.kind === "estimate.approved")).toHaveLength(1);
  });
  it("signing again changes nothing (no second job or invoice)", () => {
    const { d, id } = withEstimate();
    const s2 = companySigned(sign(d, id), id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW);
    expect(companySigned(s2, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW)).toBe(s2);
  });
  it("not before the client signed", () => {
    const { d, id } = withEstimate();
    expect(companySigned(d, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW)).toBe(d);
  });
  it("not without the right: taken away by the owner, a subcontractor, an invited person who has not joined", () => {
    const { d, id } = withEstimate();
    const s1 = sign(d, id);
    for (const patch of [{ canSignContracts: false }, { kind: "sub" as const }, { pending: true }]) {
      const s = { ...s1, members: s1.members.map((m) => (m.id === s1.me ? { ...m, ...patch } : m)) };
      expect(canCountersign(s, s.me)).toBe(false);
      expect(companySigned(s, id, { userId: s.me, signature: "M1 1", method: "drawn" }, IDS, NOW)).toBe(s);
    }
  });
  it("every employee may sign by default (founder 05.11)", () => {
    const d = makeSeed();
    for (const m of d.members.filter((x) => x.kind === "employee" && !x.pending)) expect(canCountersign(d, m.id)).toBe(true);
  });
});

describe("S8b, audit 05.11: the same as the server", () => {
  it("a quick estimate signed on site (no option chosen) also gets the job and the deposit invoice, with the op's ids", () => {
    const { d, id } = withEstimate();
    const legacy = { ...d, estimates: d.estimates.map((x) => (x.id === id ? { ...x, status: "awaiting_countersign" as const, approval: undefined, depositCents: 5000 } : x)) };
    const s = companySigned(legacy, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW);
    expect(s.jobs.find((j) => j.estimateId === id)?.id).toBe("job-new");
    expect(s.invoices.find((i) => i.jobId === "job-new" && i.kind === "deposit")).toMatchObject({ id: "inv-new", totalCents: 5000 });
  });
  it("a closed lead (lost, declined) is not won by a signature", () => {
    for (const status of ["lost", "declined"] as const) {
      const { d, id } = withEstimate();
      const e = d.estimates.find((x) => x.id === id)!;
      if (!e.leadId) return;
      const s1 = sign({ ...d, leads: d.leads.map((l) => (l.id === e.leadId ? { ...l, status } : l)) }, id);
      const s2 = companySigned(s1, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW);
      expect(s2.leads.find((l) => l.id === e.leadId)!.status).toBe(status);
    }
  });
  it("revoke / reopen: the director and the office (server: owner, admin, office), not a tech", () => {
    const d = makeSeed();
    const dir = d.members.find((m) => m.roles.includes("director"))!;
    const tech = d.members.find((m) => m.roles.length === 1 && m.roles[0] === "tech");
    expect(canManageLink(d, dir.id)).toBe(true);
    if (tech) expect(canManageLink(d, tech.id)).toBe(false);
  });
});

describe("HIS (CA salesperson registration): a warning, never a block", () => {
  const base = () => {
    const d = makeSeed();
    d.company = { ...d.company!, address: { ...d.company!.address, state: "CA" } };
    return d;
  };
  it("a non-owner in California without a number → warning", () => {
    const d = base();
    const tech = d.members.find((m) => m.kind === "employee" && !m.roles.includes("director"))!;
    expect(hisWarning(d, tech.id)).toBe(true);
    expect(canCountersign(d, tech.id)).toBe(true);
  });
  it("no warning: the director, a number given, a company outside California", () => {
    const d = base();
    const dir = d.members.find((m) => m.roles.includes("director"))!;
    const tech = d.members.find((m) => m.kind === "employee" && !m.roles.includes("director"))!;
    expect(hisWarning(d, dir.id)).toBe(false);
    expect(hisWarning({ ...d, members: d.members.map((m) => (m.id === tech.id ? { ...m, hisNumber: "HIS-123" } : m)) }, tech.id)).toBe(false);
    expect(hisWarning({ ...d, company: { ...d.company!, address: { ...d.company!.address, state: "NV" } } }, tech.id)).toBe(false);
  });
});

describe("the client link: valid until, revoked (founder 05.11)", () => {
  it("valid until = today + the company's days; 7 by default", () => {
    const now = new Date(2026, 10, 5, 23, 30);
    expect(validUntilFor(null, now)).toBe("2026-11-12");
    expect(validUntilFor({ estimate: { validDays: 3, depositBps: null } }, now)).toBe("2026-11-08");
  });
  it("unsigned: open through the last day, closed the day after; signed (client or both): always; revoked or no token: never", () => {
    const now = new Date(2026, 10, 12, 20, 0);
    expect(linkOpen({ status: "sent", validUntil: "2026-11-12", token: "t" }, now)).toBe(true);
    expect(linkOpen({ status: "sent", validUntil: "2026-11-11", token: "t" }, now)).toBe(false);
    expect(linkOpen({ status: "awaiting_countersign", validUntil: "2026-11-11", token: "t" }, now)).toBe(true); // the client signed: keeps the page
    expect(linkOpen({ status: "approved", validUntil: "2026-11-01", token: "t" }, now)).toBe(true);
    expect(linkOpen({ status: "approved", token: "t", linkRevokedAt: "2026-11-02" }, now)).toBe(false);
    expect(linkOpen({ status: "sent" }, now)).toBe(false);
  });
});
