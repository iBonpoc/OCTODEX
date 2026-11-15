/**
 * #1092 (founder 11.11: «замеры в дюймах хранить с точностью до 1/16»): lengths are kept and shown to 1/16″. Odd sixteenths
 * are text («3/16»), the eighths keep their glyph (⅜); old data in eighths reads and shows as it did; 11 15/16″ stays,
 * 11 31/32″ is a foot.
 */
import { describe, expect, it } from "vitest";
import { fmtLen, ftIn } from "../src/modules/gutters/canvas/format";
import { setLength } from "../src/modules/gutters/canvas/edit";
import { oneIn, tapeIn, unitFields } from "../src/modules/gutters/canvas/attrs";
import { fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { sixteenth, type Drawing } from "../src/modules/gutters/geometry";

describe("showing to 1/16″", () => {
  it("odd sixteenths in text, eighths in glyphs, the whole inch first", () => {
    expect(ftIn(0.0625)).toBe("1/16″");
    expect(ftIn(0.1875)).toBe("3/16″");
    expect(ftIn(0.125)).toBe("⅛″");
    expect(ftIn(5.1875)).toBe("5 3/16″");
    expect(ftIn(5.375)).toBe("5⅜″");
    expect(ftIn(12 * 8 + 5.0625)).toBe("8′ 5 1/16″");
    expect(ftIn(12 * 8 + 0.0625)).toBe("8′ 1/16″");
    expect(ftIn(12 * 8)).toBe("8′");
  });
  it("15/16 stays, 31/32 rounds up and carries into the inch and the foot", () => {
    expect(ftIn(11 + 15 / 16)).toBe("11 15/16″");
    expect(ftIn(11.96875)).toBe("1′");
    expect(ftIn(23.96875)).toBe("2′");
    expect(ftIn(0.03125)).toBe("1/16″");
    expect(ftIn(0.03124)).toBe("0″");
  });
  it("inches format: the same fractions on the whole number", () => {
    expect(fmtLen(878.0625, "in")).toBe("878 1/16″");
    expect(fmtLen(878.5, "in")).toBe("878½″");
    expect(fmtLen(0.1875, "in")).toBe("3/16″");
    expect(fmtLen(0, "in")).toBe("0″");
  });
  it("old data in eighths shows as it did", () => {
    for (const [v, s] of [[73 * 12 + 2.5, "73′ 2½″"], [8 * 12 + 9.25, "8′ 9¼″"], [0.875, "⅞″"], [100, "8′ 4″"]] as const) expect(ftIn(v)).toBe(s);
  });
  it("metric formats do not change", () => {
    expect(fmtLen(10, "mm")).toBe("254 mm");
  });
});

describe("typing to 1/16″", () => {
  it("the tape: feet, inches and sixteenths (0–15); a decimal inch is read too", () => {
    expect(tapeIn("0", "5", 3)).toBe(5.1875);
    expect(tapeIn("1", "2", 6)).toBe(14.375);
    expect(tapeIn("1", "2", 15)).toBe(14 + 15 / 16);
    expect(tapeIn("1", "2", 99)).toBe(14 + 15 / 16);
    expect(tapeIn("5", "3.0625", 0)).toBe(63.0625);
  });
  it("one number in inches or metric rounds to the nearest 1/16″", () => {
    expect(oneIn("60.0625", "in")).toBe(60.0625);
    expect(oneIn("60.04", "in")).toBe(60.0625);
    expect(oneIn("60.02", "in")).toBe(60);
    expect(oneIn("1524", "mm")).toBe(60);
    expect(oneIn("1525", "mm")).toBe(60.0625);
  });
  it("the fields show a length and read it back exactly, every sixteenth of an inch", () => {
    for (let k = 1; k <= 192 * 3; k++) {
      const n = k / 16;
      const f = unitFields(n, "ftin");
      expect(tapeIn(f.ft, f.inc, f.e16), `${n}″`).toBe(n);
    }
  });
});

describe("the length window starts from the length as it is (#1181 review Б1/Б2)", () => {
  it("in mm the field is the millimetres, not the inches", () => {
    expect(unitFields(60, "mm")).toMatchObject({ one: "1524" });
    expect(unitFields(60, "cm")).toMatchObject({ one: "152.4" });
    expect(unitFields(60, "m")).toMatchObject({ one: "1.524" });
    expect(unitFields(60, "in")).toMatchObject({ one: "60" });
  });
  it("5 3/16″ in the fields: editing another field keeps the sixteenth (the old fields showed 5¼)", () => {
    const f = unitFields(36 + 5.1875, "ftin");
    expect(f.ft).toBe("3");
    expect(f.e16).toBe(3);
    expect(tapeIn("4", f.inc, f.e16)).toBe(48 + 5.1875);
    expect(tapeIn(f.ft, "6", f.e16)).toBe(36 + 6 + 3 / 16);
    for (let k = 1; k <= 192; k++) {
      const g = unitFields(k / 16, "ftin");
      expect(tapeIn(g.ft, g.inc, g.e16), `${k}/16`).toBe(k / 16);
    }
  });
});

describe("keeping to 1/16″", () => {
  const d = (lengthIn: number): Drawing => ({ runs: [{ id: "a", a: [0, 0], b: [100, 0], lengthIn, attrs: { profile: "k", size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" } }], downspouts: [] });
  it("a run's length survives the store and back to the sixteenth", () => {
    const back = fromElements(toElements(d(878.0625), "m1"));
    expect(back.runs[0]!.lengthIn).toBe(878.0625);
  });
  it("an old length in eighths is read as it was", () => {
    expect(fromElements(toElements(d(878.125), "m1")).runs[0]!.lengthIn).toBe(878.125);
    expect(fromElements(toElements(d(878.4), "m1")).runs[0]!.lengthIn).toBe(878.375);
  });
  it("a typed length is kept to the sixteenth by setLength (e2e 168 found it kept to 1/8 here)", () => {
    const base = d(0);
    const noLen: Drawing = { ...base, runs: base.runs.map(({ lengthIn: _l, ...x }) => x) };
    expect(setLength(noLen, "a", 306.1875).runs[0]!.lengthIn).toBe(306.1875);
    expect(setLength(noLen, "a", 306.03).runs[0]!.lengthIn).toBe(306);
    expect(setLength(noLen, "a", 306.04).runs[0]!.lengthIn).toBe(306.0625);
  });
  it("the cut of a corner is to 1/16″", () => {
    expect(sixteenth(5.04)).toBe(5.0625);
    expect(sixteenth(5.02)).toBe(5);
  });
});
