/**
 * unit:activeCompany (spec 42 S34, §14, #1673) — which company opens: the current one stays (a read again never switches
 * it); else the phone's; else the server's (a new phone); else the first joined (by date, then id). A remembered id that
 * is not among the memberships just read (closed, left, switched off) is never opened (security-check С6).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));

import { orderMemberships, parseMemberships, pendingLastKey, lastCompanyKey, pickActive, sameMemberships, type Membership } from "../src/cloud/membershipSync";

const m = (companyId: string, createdAt?: string): Membership => ({ companyId, role: "tech", companyName: companyId, ...(createdAt ? { createdAt } : {}) });
const A = m("ca", "2026-11-10T00:00:00Z");
const B = m("cb", "2026-11-01T00:00:00Z");
const C = m("cc", "2026-11-05T00:00:00Z");

describe("unit:activeCompany — the order of choice", () => {
  it("current → phone → server → the first joined", () => {
    const list = [A, B, C];
    expect(pickActive(list, { current: "cc", phone: "ca", server: "cb" })).toBe("cc");
    expect(pickActive(list, { current: null, phone: "ca", server: "cb" })).toBe("ca");
    expect(pickActive(list, { phone: null, server: "cc" })).toBe("cc");
    // nothing remembered: the earliest joined (B 01.11), not the first by id
    expect(pickActive(list, {})).toBe("cb");
  });
  it("a remembered id not among the memberships is skipped at every step (closed, left, switched off)", () => {
    const list = [A, C];
    expect(pickActive(list, { current: "cb", phone: "gone", server: "cb" })).toBe("cc");
    expect(pickActive(list, { phone: "cb", server: "ca" })).toBe("ca");
  });
  it("an older answer without dates: by id; one with a date wins over none", () => {
    expect(pickActive([m("c2"), m("c1")], {})).toBe("c1");
    expect(pickActive([m("c1"), m("c2", "2026-11-01T00:00:00Z")], {})).toBe("c2");
  });
  it("no memberships — none", () => {
    expect(pickActive([], { current: "ca", phone: "ca", server: "ca" })).toBeNull();
  });
  it("the choice goes first in the fixed order; a switch is another order, so not the same answer", () => {
    const list = [A, B, C];
    expect(orderMemberships(list, pickActive(list, { phone: "cc" })).map((x) => x.companyId)).toEqual(["cc", "ca", "cb"]);
    expect(sameMemberships(orderMemberships(list, "ca"), orderMemberships(list, "cb"))).toBe(false);
  });
  it("the join date is read from the answer, when the server gives it", () => {
    expect(parseMemberships([{ company_id: "ca", role: "tech", created_at: "2026-11-10T00:00:00Z", companies: { name: "A" } }])).toEqual([
      { companyId: "ca", role: "tech", companyName: "A", createdAt: "2026-11-10T00:00:00Z" },
    ]);
    expect(parseMemberships([{ company_id: "ca", role: "tech", created_at: 5, companies: { name: "A" } }])?.[0].createdAt).toBeUndefined();
  });
  it("the phone's keys are the person's own", () => {
    expect(lastCompanyKey("u1")).not.toBe(lastCompanyKey("u2"));
    expect(pendingLastKey("u1")).toBe("octo.company.pending.v1.u1");
  });
});
