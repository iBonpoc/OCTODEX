/** Whose op is it (review #231, #240; 19 §6.12): the pure rules of the shared outbox. */
import { describe, expect, it } from "vitest";
import { adoptLegacy, mineOf, othersOf, parseOutbox, sameOwner, unsentOf, wipedOnDelete, type OwnedItem } from "../src/data/outboxOwner";

const at = "2026-11-07T00:00:00Z";
const op = (id: string, owner?: { userId: string; companyId: string }): OwnedItem =>
  ({ id, op: { k: "calendarEvent.remove", id }, at, tries: 0, ...(owner ? { owner } : {}) }) as OwnedItem;
const u1c1 = { userId: "u1", companyId: "c1" };
const u1c2 = { userId: "u1", companyId: "c2" };
const u2c1 = { userId: "u2", companyId: "c1" };
const items = [op("a", u1c1), op("b", u2c1), op("old"), op("d", u1c2), op("e", u1c1)];
const ids = (xs: readonly OwnedItem[]) => xs.map((x) => x.id);

describe("unit:outboxOwner", () => {
  it("mineOf: the person's ops in this company, in order; no one signed in — none", () => {
    expect(ids(mineOf(items, u1c1))).toEqual(["a", "old", "e"]);
    expect(ids(mineOf(items, u1c2))).toEqual(["old", "d"]);
    expect(ids(mineOf(items, u2c1))).toEqual(["b", "old"]);
    expect(mineOf(items, null)).toEqual([]);
  });
  it("othersOf: an account deletion keeps only other people's ops (an op without owner goes as the deleted one's)", () => {
    expect(ids(othersOf(items, "u1"))).toEqual(["b"]);
    expect(ids(othersOf(items, "u2"))).toEqual(["a", "d", "e"]);
    expect(ids(othersOf(items, null))).toEqual(["a", "b", "d", "e"]); // nobody known: only ownerless go
  });
  it("adoptLegacy: ownerless ops get the signed-in person once; nothing to adopt — the same array", () => {
    const adopted = adoptLegacy(items, u1c2);
    expect(adopted.find((x) => x.id === "old")!.owner).toEqual(u1c2);
    expect(adopted.filter((x) => x.id !== "old")).toEqual(items.filter((x) => x.id !== "old")); // others untouched
    expect(adoptLegacy(adopted, u2c1)).toBe(adopted);
    expect(adoptLegacy(items, null)).toBe(items);
    // once adopted in c2, it is not «mine» in c1 any more (review #240 №3)
    expect(ids(mineOf(adopted, u1c1))).toEqual(["a", "e"]);
  });
  it("unsentOf: the person's ops in every company (and ownerless), for the account deletion", () => {
    expect(unsentOf(items, "u1")).toBe(4);
    expect(unsentOf(items, "u2")).toBe(2);
    expect(unsentOf(items, null)).toBe(0);
  });
  it("sameOwner, parseOutbox, wipedOnDelete", () => {
    expect(sameOwner(u1c1, { ...u1c1 })).toBe(true);
    expect(sameOwner(u1c1, u1c2)).toBe(false);
    expect(sameOwner(u1c1, null)).toBe(false);
    expect(ids(parseOutbox(JSON.stringify(items)))).toEqual(ids(items));
    expect(parseOutbox("{broken")).toEqual([]);
    expect(parseOutbox('{"a":1}')).toEqual([]);
    expect(parseOutbox(null)).toEqual([]);
    expect(wipedOnDelete("octo.outbox.v1")).toBe(false);
    expect(wipedOnDelete("octo.role.v1")).toBe(true);
    expect(wipedOnDelete("octo.cloud.v1.c1")).toBe(true);
    expect(wipedOnDelete("octo.theme.v1")).toBe(false);
  });
});
