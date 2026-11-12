import { describe, it, expect } from "vitest";
import { formatBps, formatCents, formatWhole, parseBps, parseCents, parseQuantity, parseWhole } from "../src/ui/numberInput";

describe("number input (DS А6.2): errors, never a quiet zero", () => {
  it.each(["-100", "abc", "1e5", "12,50", "1.2.3", "$", "."])("money «%s» is an error", (s) => {
    expect(parseCents(s)).toEqual({ state: "bad" });
  });
  it("money: valid shapes", () => {
    expect(parseCents("12.5")).toEqual({ state: "ok", value: 1250 });
    expect(parseCents("$1,234.50")).toEqual({ state: "ok", value: 123450 });
    expect(parseCents(" 7 ")).toEqual({ state: "ok", value: 700 });
    expect(parseCents("1,234,567")).toEqual({ state: "ok", value: 123456700 });
  });
  it("empty is not an error (the required rule decides)", () => {
    for (const p of [parseCents, parseBps, parseQuantity, parseWhole]) expect(p("  ")).toEqual({ state: "empty" });
  });
  it("percent", () => {
    expect(parseBps("8.25")).toEqual({ state: "ok", value: 825 });
    expect(parseBps("8.25%")).toEqual({ state: "ok", value: 825 });
    for (const s of ["-5", "x", "1e2", "8,25"]) expect(parseBps(s)).toEqual({ state: "bad" });
  });
  it("quantity", () => {
    expect(parseQuantity("2.5")).toEqual({ state: "ok", value: "2.5" });
    for (const s of ["-1", "abc", "1,5", "1e3"]) expect(parseQuantity(s)).toEqual({ state: "bad" });
  });
  it("integer", () => {
    expect(parseWhole("12")).toEqual({ state: "ok", value: 12 });
    expect(parseWhole("1,000")).toEqual({ state: "ok", value: 1000 });
    for (const s of ["1.5", "-2", "12,5", "abc"]) expect(parseWhole(s)).toEqual({ state: "bad" });
  });
  it("US format on leaving", () => {
    expect(formatCents(123450)).toBe("1,234.50");
    expect(formatCents(1250)).toBe("12.50");
    expect(formatCents(0)).toBe("0.00");
    expect(formatBps(825)).toBe("8.25");
    expect(formatBps(800)).toBe("8");
    expect(formatWhole(12000)).toBe("12,000");
  });
});
