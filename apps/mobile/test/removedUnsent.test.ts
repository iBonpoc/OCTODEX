/**
 * #1669: which companies I was removed from still have my changes on this phone (the sheet «Вас убрали из компании»).
 * Only a CONFIRMED membership answer says «removed» (no answer — nobody is guessed), only my ops, not the companies the closed-company
 * card tells about, not an op without an owner; several companies are separate rows with their own count.
 */
import { describe, expect, it } from "vitest";
import { removedUnsent } from "../src/features/closedCompany";
import type { OwnedItem } from "../src/data/outboxOwner";

const op = (userId: string, companyId: string | null): OwnedItem => ({ id: `${userId}-${companyId}-${Math.random()}`, ...(companyId ? { owner: { userId, companyId } } : {}) }) as OwnedItem;

describe("unit:removedUnsent — companies I was removed from", () => {
  it("my ops in a company that is not among my confirmed memberships: counted per company", () => {
    const items = [op("u1", "A"), op("u1", "B"), op("u1", "B"), op("u1", "C")];
    expect(removedUnsent(items, "u1", new Set(["A"]))).toEqual([
      { companyId: "B", n: 2 },
      { companyId: "C", n: 1 },
    ]);
  });
  it("no confirmed answer yet (null): nobody is «removed»; nobody signed in: nothing", () => {
    expect(removedUnsent([op("u1", "B")], "u1", null)).toEqual([]);
    expect(removedUnsent([op("u1", "B")], null, new Set())).toEqual([]);
  });
  it("another person's ops, ops of a company I am in and ownerless ops are not mine to report", () => {
    const items = [op("u2", "B"), op("u1", "A"), op("u1", null)];
    expect(removedUnsent(items, "u1", new Set(["A"]))).toEqual([]);
  });
  it("a company the closed-company card tells about is skipped (it has its own card)", () => {
    const items = [op("u1", "B"), op("u1", "C")];
    expect(removedUnsent(items, "u1", new Set(["A"]), new Set(["B"]))).toEqual([{ companyId: "C", n: 1 }]);
  });
  it("a person with no company at all (an empty confirmed list): every company with my ops is «removed»", () => {
    expect(removedUnsent([op("u1", "B")], "u1", new Set())).toEqual([{ companyId: "B", n: 1 }]);
  });
});
