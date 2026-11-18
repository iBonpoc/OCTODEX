import { describe, expect, it } from "vitest";
import { groupByLetter, groupKey } from "@/features/clientGroups";

// #2014 С2: the grouping of the clients list never falls
describe("clients list groups (#2014)", () => {
  it("С2 an empty name, only spaces, null — the «#» group, no crash", () => {
    expect(groupKey("")).toBe("#");
    expect(groupKey("   ")).toBe("#");
    expect(groupKey(undefined)).toBe("#");
    expect(groupKey(null)).toBe("#");
  });
  it("С2 a digit, an emoji, a sign at the start — «#»", () => {
    expect(groupKey("1st Choice Roofing")).toBe("#");
    expect(groupKey("🏠 Home Pro")).toBe("#");
    expect(groupKey("@acme")).toBe("#");
  });
  it("a letter — that letter in upper case, leading spaces skipped", () => {
    expect(groupKey("sarah Mitchell")).toBe("S");
    expect(groupKey("  linda")).toBe("L");
    expect(groupKey("Ángel Ruiz")).toBe("Á");
    expect(groupKey("Иван")).toBe("И");
  });
  it("groups keep the list's order", () => {
    const g = groupByLetter([{ name: "Bob" }, { name: "" }, { name: "Bill" }, { name: "Ann" }]);
    expect(g.map(([k, cs]) => [k, cs.length])).toEqual([["B", 2], ["#", 1], ["A", 1]]);
  });
});
