import { describe, expect, it, vi } from "vitest";
import { holdForOwnBad, markOwnBad } from "../src/modules/gutters/draw/ownBad";

describe("ownBad (#3090): «Сохранить» holds the window while a «Свой» field is bad", () => {
  it("nothing bad: saves", () => {
    expect(holdForOwnBad()).toBe(false);
  });
  it("a bad field: holds and shows its warning; fixed — saves", () => {
    const reveal = vi.fn();
    markOwnBad("attr-ds-length", reveal);
    expect(holdForOwnBad()).toBe(true);
    expect(reveal).toHaveBeenCalledTimes(1);
    markOwnBad("attr-ds-length", null);
    expect(holdForOwnBad()).toBe(false);
  });
  it("two fields: each warns; one fixed still holds", () => {
    const a = vi.fn(), b = vi.fn();
    markOwnBad("attr-ds-size", a);
    markOwnBad("attr-offset-own", b);
    expect(holdForOwnBad()).toBe(true);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    markOwnBad("attr-ds-size", null);
    expect(holdForOwnBad()).toBe(true);
    markOwnBad("attr-offset-own", null);
    expect(holdForOwnBad()).toBe(false);
  });
});
