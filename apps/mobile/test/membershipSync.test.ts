/**
 * unit:membershipSync (#1633 A2) — the rules behind «removed from a company / another role»: a fixed order of the
 * memberships (a read again never switches the company), the same answer keeps the same array, the company's own read
 * tells a removal or a role change, and a signal never reads more often than once per 5 minutes (no loop on 42501).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));

import { MEMBERSHIP_REREAD_MS, memberMatches, orderMemberships, parseMemberships, rereadDelay, sameMemberships, type DbRole, type Membership } from "../src/cloud/membershipSync";
import { appRoles } from "../src/cloud/repo";
import type { Member } from "../src/data/types";

const m = (companyId: string, role: DbRole = "tech", companyName = companyId): Membership => ({ companyId, role, companyName });

describe("unit:membershipSync — order (#1633 A2)", () => {
  it("by company, the one worked in first; unknown preferred — by order", () => {
    const list = [m("c3"), m("c1"), m("c2")];
    expect(orderMemberships(list, null).map((x) => x.companyId)).toEqual(["c1", "c2", "c3"]);
    expect(orderMemberships(list, "c3").map((x) => x.companyId)).toEqual(["c3", "c1", "c2"]);
    expect(orderMemberships(list, "gone").map((x) => x.companyId)).toEqual(["c1", "c2", "c3"]);
    expect(list.map((x) => x.companyId)).toEqual(["c3", "c1", "c2"]); // the input is not changed
  });
  it("the same answer is the same; a role, a name or the order differ — not", () => {
    expect(sameMemberships([m("c1"), m("c2")], [m("c1"), m("c2")])).toBe(true);
    expect(sameMemberships([m("c1")], [m("c1", "office")])).toBe(false);
    expect(sameMemberships([m("c1")], [m("c1", "tech", "New")])).toBe(false);
    expect(sameMemberships([m("c1"), m("c2")], [m("c2"), m("c1")])).toBe(false);
    expect(sameMemberships([m("c1")], [])).toBe(false);
  });
  it("an answer that is not a list, or with one broken row, is not an answer (a dropped row would read as «removed»)", () => {
    expect(parseMemberships(null)).toBeNull();
    expect(parseMemberships({ company_id: "c1" })).toBeNull();
    expect(parseMemberships([])).toEqual([]);
    const good = [
      { company_id: "c1", role: "owner", companies: { name: "A" } },
      { company_id: "c2", role: "tech", companies: [{ name: "B" }] },
      { company_id: "c3", role: "sales", companies: null },
    ];
    expect(parseMemberships(good)).toEqual([m("c1", "owner", "A"), m("c2", "tech", "B"), m("c3", "sales", "")]);
    for (const bad of [{ company_id: 4, role: "tech" }, { role: "tech" }, { company_id: "c4", role: "manager" }, { company_id: "", role: "tech" }, null])
      expect(parseMemberships([...good, bad]), JSON.stringify(bad)).toBeNull();
  });
});

describe("unit:membershipSync — the company's own read tells a removal or a role change (#1633 A2)", () => {
  const ROLES: DbRole[] = ["owner", "admin", "office", "sales", "tech", "subcontractor"];
  const row = (r: DbRole): Member => ({ id: "u1", name: "Me", initials: "M", kind: r === "subcontractor" ? "sub" : "employee", roles: appRoles(r), isOwner: r === "owner" });
  it("my row as repo.ts builds it matches only my own role (every pair)", () => {
    for (const a of ROLES) for (const b of ROLES) expect(memberMatches(row(a), b), `${a} as ${b}`).toBe(a === b);
  });
  it("no row, switched off or pending — not a member", () => {
    expect(memberMatches(undefined, "tech")).toBe(false);
    expect(memberMatches({ ...row("tech"), disabled: true, pending: true }, "tech")).toBe(false);
    expect(memberMatches({ ...row("tech"), pending: true }, "tech")).toBe(false);
  });
});

describe("unit:membershipSync — read again at most once per 5 minutes (#1633 A2)", () => {
  it("never read — now; inside the window — at its end (not dropped); after it — now", () => {
    expect(rereadDelay(1_000, null)).toBe(0);
    expect(rereadDelay(60_000, 0)).toBe(MEMBERSHIP_REREAD_MS - 60_000);
    expect(rereadDelay(MEMBERSHIP_REREAD_MS, 0)).toBe(0);
    expect(rereadDelay(MEMBERSHIP_REREAD_MS + 5, 0)).toBe(0);
  });
});
