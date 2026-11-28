/** Своя высота водостока (#2985): число футов вместо меню «Длина»; пусто — по этажу. */
import { describe, expect, it } from "vitest";
import { DS_OWN_FT_MAX, dsOwnFt } from "../src/modules/gutters/draw/dsOwnFt";

describe("С5 (spec 33-windows #2978): dsOwnFt — своя высота трубы", () => {
  it("empty — by the storey", () => {
    expect(dsOwnFt("")).toBeNull();
    expect(dsOwnFt("  ")).toBeNull();
  });
  it("feet, to half a foot; a comma is a point", () => {
    expect(dsOwnFt("20")).toBe(20);
    expect(dsOwnFt("12.4")).toBe(12.5);
    expect(dsOwnFt("9,5")).toBe(9.5);
  });
  it("out of 1–100 ft or not a number — bad", () => {
    expect(dsOwnFt("0")).toBe("bad");
    expect(dsOwnFt("0.2")).toBe("bad");
    expect(dsOwnFt(String(DS_OWN_FT_MAX + 1))).toBe("bad");
    expect(dsOwnFt("abc")).toBe("bad");
    expect(dsOwnFt(String(DS_OWN_FT_MAX))).toBe(DS_OWN_FT_MAX);
  });
});
