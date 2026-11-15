import { describe, it, expect } from "vitest";
import { MAX_CENTS, finishText, formatBps, formatCents, formatWhole, needsResync, parseBps, parseCents, parseQuantity, parseWhole } from "../src/ui/numberInput";

const ok = <V>(value: V) => ({ state: "ok", value });
const BAD = { state: "bad" };

describe("number input (DS А6.2): errors, never a quiet zero", () => {
  it.each(["-100", "abc", "1e5", "1.2.3", ","])("money «%s» is an error", (s) => {
    expect(parseCents(s)).toEqual(BAD);
  });
  it("money: valid shapes", () => {
    expect(parseCents("12.5")).toEqual(ok(1250));
    expect(parseCents(".5")).toEqual(ok(50));
    expect(parseCents("$1,234.50")).toEqual(ok(123450));
    expect(parseCents("$ 1,234.56")).toEqual(ok(123456));
    expect(parseCents(" 7 ")).toEqual(ok(700));
    expect(parseCents("1,234,567")).toEqual(ok(123456700));
  });
  it("a third decimal is an error, not a quiet rounding", () => {
    expect(parseCents("12.345")).toEqual(BAD);
    expect(parseBps("8.875")).toEqual(BAD);
    expect(parseCents("12.30")).toEqual(ok(1230));
  });
  it("commas: a decimal comma (an iPhone without «.») and thousands (Б5)", () => {
    expect(parseCents("12,5")).toEqual(ok(1250));
    expect(parseCents("12,50")).toEqual(ok(1250));
    expect(parseCents("1,23")).toEqual(ok(123));
    expect(parseCents("1,500")).toEqual(ok(150000));
    expect(parseCents("1,500.25")).toEqual(ok(150025));
    for (const s of ["1,2,3", "12,5000", "1,50,000", "1,5.5", "1.500,5"]) expect(parseCents(s), s).toEqual(BAD);
  });
  it("commas in a percent and in a quantity are read the same way (not «1,000 = 1»)", () => {
    expect(parseBps("1,000")).toEqual(ok(100000));
    expect(parseBps("8,25")).toEqual(ok(825));
    expect(parseQuantity("1,000")).toEqual(ok("1000"));
    expect(parseQuantity("2,5")).toEqual(ok("2.5"));
    expect(parseWhole("1,000")).toEqual(ok(1000));
    expect(parseWhole("12,5")).toEqual(BAD);
  });
  it("unfinished text is not an error yet: «2,» «.»", () => {
    expect(parseCents("2,")).toEqual({ state: "partial" });
    expect(parseCents(".")).toEqual({ state: "partial" });
    expect(parseCents("2.")).toEqual(ok(200));
    expect(finishText("2,")).toBe("2");
    expect(finishText("5.")).toBe("5");
  });
  it("huge numbers are an error, never 1e22", () => {
    expect(parseCents("99999999999999999999")).toEqual(BAD);
    expect(parseCents("1000000000")).toEqual(BAD);
    expect(parseCents("999999999.99")).toEqual(ok(MAX_CENTS));
    expect(parseBps("99999999999999999999")).toEqual(BAD);
    expect(parseBps("10000")).toEqual(ok(1000000));
    expect(parseBps("10000.01")).toEqual(BAD);
    expect(parseQuantity("9999999999")).toEqual(BAD);
    expect(parseQuantity("1.23456")).toEqual(BAD);
    expect(parseWhole("99999999999999999999")).toEqual(BAD);
  });
  it("empty is its own state", () => {
    for (const p of [parseCents, parseBps, parseQuantity, parseWhole]) expect(p("  ")).toEqual({ state: "empty" });
  });
  it("percent", () => {
    expect(parseBps("8.25")).toEqual(ok(825));
    expect(parseBps("8.25%")).toEqual(ok(825));
    for (const s of ["-5", "x", "1e2"]) expect(parseBps(s)).toEqual(BAD);
  });
  it("quantity", () => {
    expect(parseQuantity("2.5")).toEqual(ok("2.5"));
    for (const s of ["-1", "abc", "1e3"]) expect(parseQuantity(s)).toEqual(BAD);
  });
  it("integer", () => {
    expect(parseWhole("12")).toEqual(ok(12));
    for (const s of ["1.5", "-2", "abc"]) expect(parseWhole(s)).toEqual(BAD);
  });
  it("US format on leaving (the engine's)", () => {
    expect(formatCents(123450)).toBe("1,234.50");
    expect(formatCents(1250)).toBe("12.50");
    expect(formatCents(0)).toBe("0.00");
    expect(formatBps(825)).toBe("8.25");
    expect(formatBps(800)).toBe("8");
    expect(formatWhole(12000)).toBe("12,000");
  });
});

describe("the field's text and the screen's value stay one (Б2)", () => {
  it("a right text of the same value stays; another value rewrites it", () => {
    expect(needsResync(parseQuantity("2.50"), "2.5", undefined)).toBe(false); // the engine reads 2.50 as 2.5: the person keeps typing
    expect(needsResync(parseQuantity("2.5"), "2.5", undefined)).toBe(false);
    expect(needsResync(parseQuantity("3"), "2.5", undefined)).toBe(true);
  });
  it("an empty quantity is not a value: an outer change rewrites it", () => {
    expect(needsResync(parseQuantity(""), "2.5", undefined)).toBe(true);
  });
  it("an empty money is zero", () => {
    expect(needsResync(parseCents(""), 0, 0)).toBe(false);
    expect(needsResync(parseCents(""), 500, 0)).toBe(true);
  });
  it("a text that is not a number is rewritten by an outer change", () => {
    expect(needsResync(parseCents("abc"), 500, 0)).toBe(true);
  });
});
