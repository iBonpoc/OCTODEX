import { describe, expect, it } from "vitest";
import { clientListGroups, groupByLetter, groupKey, LETTERS_FROM } from "@/features/clientGroups";

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

// wave 2 (#2350, audit 2.1): a short list is one card of rows, the letters from 50 clients
describe("clients list: one card under 50, letters from 50", () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => ({ name: `${String.fromCharCode(65 + (i % 26))}${i}` }));
  it("7 clients — one group without a letter", () => {
    const g = clientListGroups(n(7));
    expect(g).toHaveLength(1);
    expect(g[0]!.title).toBeUndefined();
    expect(g[0]!.rows).toHaveLength(7);
  });
  it("nothing — no group (the empty state is drawn)", () => expect(clientListGroups([])).toEqual([]));
  it("50 clients — a group per letter, titled", () => {
    const g = clientListGroups(n(LETTERS_FROM));
    expect(g.length).toBe(26);
    expect(g[0]).toMatchObject({ key: "A", title: "A" });
  });
});
