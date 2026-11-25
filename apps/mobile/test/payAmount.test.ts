/** #2217 — the sum of «Принять оплату»: quick amounts, typed cents and the large figure, all through the engine (rule 8). */
import { describe, expect, it } from "vitest";
import { bigAmount, quickAmounts, quickChosen, recordedCents, typedCents } from "../src/features/payments/payAmount";

describe("quickAmounts", () => {
  it("the whole balance, half, the deposit", () => {
    expect(quickAmounts(184000, 50000)).toEqual([
      { key: "all", cents: 184000 },
      { key: "half", cents: 92000 },
      { key: "deposit", cents: 50000 },
    ]);
  });
  it("half of an odd cent is rounded up by the engine, never above the balance", () => {
    expect(quickAmounts(101)[1]).toEqual({ key: "half", cents: 51 });
    expect(quickAmounts(1)).toEqual([{ key: "all", cents: 1 }]);
  });
  it("no deposit button when it is none, the whole, more, or the same as half", () => {
    expect(quickAmounts(10000, 0).map((q) => q.key)).toEqual(["all", "half"]);
    expect(quickAmounts(10000, 10000).map((q) => q.key)).toEqual(["all", "half"]);
    expect(quickAmounts(10000, 20000).map((q) => q.key)).toEqual(["all", "half"]);
    expect(quickAmounts(10000, 5000).map((q) => q.key)).toEqual(["all", "half"]);
  });
  it("nothing owed — no buttons", () => {
    expect(quickAmounts(0, 100)).toEqual([]);
    expect(quickAmounts(-5)).toEqual([]);
  });
  it("the typed sum shows its button chosen", () => {
    const q = quickAmounts(184000, 50000);
    expect(quickChosen(92000, q)).toBe("half");
    expect(quickChosen(12345, q)).toBeUndefined();
  });
});

describe("typed cents and the figure (engine)", () => {
  it("parses what is typed on the number keyboard", () => {
    expect(typedCents("1,840.5")).toBe(184050);
    expect(typedCents("$12")).toBe(1200);
    expect(typedCents("0.105")).toBe(11);
    expect(typedCents("")).toBe(0);
    expect(typedCents("12a")).toBeNull();
  });
  it("records never above the balance, never below 0", () => {
    expect(recordedCents(999999, 207800)).toBe(207800);
    expect(recordedCents(100000, 207800)).toBe(100000);
    expect(recordedCents(-5, 207800)).toBe(0);
  });
  it("the large figure in the US format with cents", () => {
    expect(bigAmount(184000)).toBe("$1,840.00");
    expect(bigAmount(5)).toBe("$0.05");
    expect(bigAmount(123456789)).toBe("$1,234,567.89");
  });
});
