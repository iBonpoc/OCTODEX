/** 7а-3 «в» (docs/specs/22 §3.6): the people of a closed company — what the phone shows and what it removes */
import { describe, expect, it } from "vitest";
import { closedAnswerCounts, closedDay, parseClosed, parseSeen, unseenClosed, unsentIn, withoutUnsentIn } from "../src/features/closedCompany";
import type { OwnedItem } from "../src/data/outboxOwner";

const op = (id: string, owner?: { userId: string; companyId: string }): OwnedItem =>
  ({ id, op: { k: "lead.add" }, at: "2026-11-07T10:00:00Z", tries: 0, ...(owner ? { owner } : {}) }) as unknown as OwnedItem;

describe("closed companies", () => {
  it("the server's rows → the app's shape; broken rows are left out", () => {
    expect(parseClosed([{ company_id: "c1", name: "Solo Co", closed_at: "2026-11-07T09:00:00Z" }])).toEqual([
      { companyId: "c1", name: "Solo Co", closedAt: "2026-11-07T09:00:00Z" },
    ]);
    expect(parseClosed([{ company_id: 1 }, null, { company_id: "c2", closed_at: "x" }])).toEqual([{ companyId: "c2", name: "", closedAt: "x" }]);
    expect(parseClosed(null)).toEqual([]);
    expect(parseClosed({})).toEqual([]);
  });
  it("the start sheet: once per company (founder 07.11)", () => {
    const list = parseClosed([
      { company_id: "c1", name: "A", closed_at: "t" },
      { company_id: "c2", name: "B", closed_at: "t" },
    ]);
    expect(unseenClosed(list, []).map((c) => c.companyId)).toEqual(["c1", "c2"]);
    expect(unseenClosed(list, ["c1"]).map((c) => c.companyId)).toEqual(["c2"]);
    expect(unseenClosed(list, ["c1", "c2"])).toEqual([]);
    expect(parseSeen('["c1", 2]')).toEqual(["c1"]);
    expect(parseSeen("{broken")).toEqual([]);
    expect(parseSeen(null)).toEqual([]);
  });
  it("only my changes for that company are counted and removed; others stay (rule 6)", () => {
    const items = [
      op("1", { userId: "me", companyId: "closed" }),
      op("2", { userId: "me", companyId: "other" }),
      op("3", { userId: "someone", companyId: "closed" }),
      op("4"),
      op("5", { userId: "me", companyId: "closed" }),
    ];
    expect(unsentIn(items, "me", "closed").map((o) => o.id)).toEqual(["1", "5"]);
    expect(withoutUnsentIn(items, "me", "closed").map((o) => o.id)).toEqual(["2", "3", "4"]);
    // not signed in: nothing counted, nothing removed
    expect(unsentIn(items, null, "closed")).toEqual([]);
    expect(withoutUnsentIn(items, null, "closed")).toHaveLength(5);
  });
  it("the day of the closing in the US format (rule 7)", () => {
    expect(closedDay("2026-11-05T18:00:00Z")).toBe("Nov 5, 2026");
    expect(closedDay("nonsense")).toBe("");
  });
  it("a late answer never reaches the next person on this phone (security-check #312)", () => {
    expect(closedAnswerCounts(3, 3, "u1", "u1")).toBe(true);
    // another person signed in meanwhile
    expect(closedAnswerCounts(3, 3, "u1", "u2")).toBe(false);
    // signed out
    expect(closedAnswerCounts(3, 3, "u1", null)).toBe(false);
    // a newer ask or a clearing came after it
    expect(closedAnswerCounts(2, 3, "u1", "u1")).toBe(false);
  });
});
