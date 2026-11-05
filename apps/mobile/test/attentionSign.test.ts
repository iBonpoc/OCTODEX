/**
 * E2b-2 «Требует внимания» for signing (docs/specs/07 «E2b — экраны подписи» §3, §7, §8):
 * «sign the contract» only for those who may sign; «expired» for director and office, instead of «no reply»;
 * «declined by the company» until the lead is changed or closed; no «remind the client» once the client signed.
 */
import { describe, expect, it } from "vitest";
import { attentionHref, buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import type { DB, Estimate } from "../src/data/types";

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function withEstimate(patch: Partial<Estimate>): { d: DB; id: string } {
  const d = makeSeed();
  const lead = d.leads[0]!;
  d.leads = d.leads.map((l) => (l.id === lead.id ? { ...l, status: "estimate_sent" } : l));
  const e: Estimate = { id: "eA", customerId: d.customers[0]!.id, propertyId: d.properties[0]!.id, title: "Porch", totalCents: 50000, status: "sent", sentAt: ago(6), leadId: lead.id, token: "t", ...patch };
  d.estimates = [...d.estimates, e];
  return { d, id: e.id };
}
const of = (d: DB, id: string, role?: "director" | "dispatcher" | "tech") => buildAttention(d, role).filter((i) => i.refId === id);
const asTech = (d: DB): DB => {
  const tech = d.members.find((m) => m.kind === "employee" && !m.roles.includes("director") && !m.roles.includes("dispatcher") && !m.pending)!;
  return { ...d, me: tech.id };
};

describe("the client signed → «sign the contract»", () => {
  it("warn, above «schedule a date», opens the estimate", () => {
    const { d, id } = withEstimate({ status: "awaiting_countersign" });
    const items = of(d, id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "estimateSign", status: "warn", label: "att.awaitingSign" });
    expect(items[0]!.score).toBeGreaterThan(950);
    expect(attentionHref(items[0]!)).toBe(`/estimate/${id}`);
  });
  it("only for those who may sign: the right taken away → no item", () => {
    const { d, id } = withEstimate({ status: "awaiting_countersign" });
    const s = { ...d, members: d.members.map((m) => (m.id === d.me ? { ...m, canSignContracts: false } : m)) };
    expect(of(s, id)).toHaveLength(0);
  });
  it("every employee may sign by default, a tech too", () => {
    const { d, id } = withEstimate({ status: "awaiting_countersign" });
    expect(of(asTech(d), id, "tech").map((i) => i.kind)).toEqual(["estimateSign"]);
  });
  it("the lead whose estimate the client signed gets no «remind the client»", () => {
    // a lead waiting for the client long enough to get «remind» (estimate_sent, quiet for 10 days, no open task)
    const quiet = (status: Estimate["status"]): DB => {
      const { d } = withEstimate({ status, sentAt: ago(10) });
      const leadId = d.leads[0]!.id;
      return {
        ...d,
        leads: d.leads.map((l) => (l.id === leadId ? { ...l, status: "estimate_sent", lastInboundAt: undefined, lastOutboundAt: ago(10), lastActivityAt: ago(10), remindedAt: undefined, snoozedUntil: undefined } : l)),
        tasks: d.tasks.filter((t) => t.subjectId !== leadId),
        activities: d.activities.filter((a) => a.subjectId !== leadId),
      };
    };
    const idle = (s: DB) => buildAttention(s).some((i) => i.refId === s.leads[0]!.id && i.kind === "leadIdle");
    expect(idle(quiet("sent"))).toBe(true); // the control: without the client's signature it would be reminded
    expect(idle(quiet("awaiting_countersign"))).toBe(false);
  });
});

describe("past «valid until» → «expired»", () => {
  it("neutral, for director and office; replaces «no reply N days»", () => {
    const { d, id } = withEstimate({ validUntil: day(-1) });
    for (const role of ["director", "dispatcher"] as const) {
      const items = of(d, id, role);
      expect(items.map((i) => i.kind)).toEqual(["estimateExpired"]);
      expect(items[0]!.status).toBe("neutral");
    }
  });
  it("not for a tech", () => {
    const { d, id } = withEstimate({ validUntil: day(-1) });
    expect(of(asTech(d), id, "tech")).toHaveLength(0);
  });
  it("the last day is still valid: «no reply» as before", () => {
    const { d, id } = withEstimate({ validUntil: day(0) });
    expect(of(d, id).map((i) => i.kind)).toEqual(["estimate"]);
  });
  it("a revoked link is not «expired»; a signed estimate never is", () => {
    expect(of(withEstimate({ validUntil: day(-3), linkRevokedAt: ago(1) }).d, "eA").some((i) => i.kind === "estimateExpired")).toBe(false);
    expect(of(withEstimate({ validUntil: day(-3), status: "approved" }).d, "eA")).toHaveLength(0);
  });
});

describe("declined by the company → «change it or close the lead»", () => {
  it("warn with the reason, for director and office, while the lead is open", () => {
    const { d, id } = withEstimate({ status: "declined", declinedText: "no crew this month" });
    const items = of(d, id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "estimateDeclined", status: "warn", params: { text: "no crew this month" } });
    expect(of(asTech(d), id, "tech")).toHaveLength(0);
  });
  it("gone once the lead is closed or archived", () => {
    for (const patch of [{ status: "lost" as const }, { status: "won" as const }, { archivedAt: ago(0) }]) {
      const { d, id } = withEstimate({ status: "declined", declinedText: "x" });
      const s = { ...d, leads: d.leads.map((l) => (l.id === d.leads[0]!.id ? { ...l, ...patch } : l)) };
      expect(of(s, id)).toHaveLength(0);
    }
  });
  it("declined by the client (no company reason) is not this item", () => {
    const { d, id } = withEstimate({ status: "declined" });
    expect(of(d, id)).toHaveLength(0);
  });
});
