/**
 * #1092: one format of lengths for the company (founder 12.11: «везде так, как выбрано в настройках»). The table of the six
 * formats, the setting, the sheet and the documents in every format, and the guard: a length is shown only through fmtLen.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { drawingPrint as DP } from "@octo/design-tokens";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts } from "@octo/estimating-engine";
import { tFor } from "../src/i18n/translate";
import { fmtLen, LEN_FORMATS, isLenFormat, type LenFormat } from "../src/modules/gutters/canvas/format";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { partName, partQty } from "../src/modules/gutters/prices";
import { choicesFor, readLenFormat } from "../src/modules/gutters/settings";
import { blueprint, scaleBarIn } from "../src/modules/gutters/view/blueprint";
import { drawingPdfHtml } from "../src/modules/gutters/view/drawingPdf";
import { measureSpec } from "../src/modules/gutters/view/spec";
import type { DocPrim } from "../src/features/docPages";

const IN = 73 * 12 + 2.5; // 73′ 2½″

describe("the six formats", () => {
  it("the same length in each", () => {
    const want: Record<LenFormat, string> = { ftin: "73′ 2½″", in: "878½″", m: "22.314 m", cm: "2231.4 cm", mm: "22314 mm" };
    for (const f of LEN_FORMATS) expect(fmtLen(IN, f), f).toBe(want[f]);
  });
  it("edges: zero, a whole foot, no decimal feet (the format is not offered), 11⅞″ rounding up to the foot, one eighth, a long run", () => {
    expect(fmtLen(0, "ftin")).toBe("0″");
    expect(fmtLen(12, "ftin")).toBe("1′");
    expect(fmtLen(11.9375, "ftin")).toBe("1′");
    expect(fmtLen(0.125, "in")).toBe("⅛″");
    expect(fmtLen(250 * 12 + 4, "ftin")).toBe("250′ 4″");
    expect(fmtLen(12, "mm")).toBe("305 mm");
    expect(LEN_FORMATS).toEqual(["ftin", "in", "m", "cm", "mm"]);
    expect(isLenFormat("ft")).toBe(false);
  });
  it("the decimal point is «.» whatever the language (rule 7): no comma anywhere", () => {
    for (const f of LEN_FORMATS) expect(fmtLen(IN + 0.3, f)).not.toContain(",");
  });
  it("the setting: the value or feet-inches; the choices carry it", () => {
    expect(readLenFormat(undefined)).toBe("ftin");
    expect(readLenFormat("furlongs")).toBe("ftin");
    expect(readLenFormat(5)).toBe("ftin");
    for (const f of LEN_FORMATS) {
      expect(isLenFormat(f)).toBe(true);
      expect(choicesFor({ lenFormat: f }).lenFormat).toBe(f);
    }
    expect(choicesFor({}).lenFormat).toBe("ftin");
    expect(choicesFor({ lenFormat: "x" }).lenFormat).toBe("ftin");
  });
});

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
const d: Drawing = {
  runs: [r("a", [0, 0], [ft(73) + 2, 0]), r("b", [ft(73) + 2, 0], [ft(73) + 2, ft(15)])],
  downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d1", runId: "a", atIn: 6 }],
};
const parts = computeGutterParts(toMeasurement(d)).parts;
const spec = measureSpec(d, parts);
const company = { name: "Test Gutters LLC", licenses: [], contacts: [] };
const stamp = { company: "Test Gutters LLC", address: "12 Oak St", date: "11/10/2026", rough: false };
const texts = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x").map((p) => p.s);

describe("the sheet follows the format", () => {
  for (const f of LEN_FORMATS) {
    it(`${f}: the dimension lines and the scale bar are in it`, () => {
      const tx = texts(blueprint(d, tFor("en"), { ...stamp, fmt: f }).items);
      expect(tx).toContain(fmtLen(ft(73) + 2, f));
      expect(tx).toContain(fmtLen(ft(15), f));
      const bar = scaleBarIn(1, f);
      expect(bar).toBeGreaterThan(0);
    });
  }
  it("a run's own old unit no longer changes the sheet", () => {
    const old: Drawing = { ...d, runs: d.runs.map((x) => ({ ...x, unit: "mm" as const })) };
    expect(texts(blueprint(old, tFor("en"), stamp).items)).toContain("73′ 2″");
  });
  it("metric formats: the scale bar is whole metres", () => {
    const k = DP.scalePx / ((5000 / 25.4));
    expect(scaleBarIn(k, "mm") * 25.4).toBeCloseTo(5000, 3);
    expect(scaleBarIn(DP.scalePx / 1200, "ftin")).toBe(1200);
  });
});

describe("the documents follow the format, in every language", () => {
  for (const f of LEN_FORMATS) {
    for (const lang of ["en", "es", "ru"] as const) {
      it(`crew PDF, ${f}, ${lang}: walls, faces, corners and parts`, () => {
        const h = drawingPdfHtml({ kind: "crew", drawing: d, spec, t: tFor(lang), opts: { lang }, company, rough: false, date: "11/10/2026", fmt: f });
        expect(h).toContain(fmtLen(ft(73) + 2, f));
        const body = h.slice(h.indexOf("<h2>"));
        if (f !== "ftin") expect(body).not.toMatch(/\d′/);
        expect(body).not.toMatch(/\d\.\d{4,}/);
      });
    }
  }
  it("parts: the quantity of a length and the coil's blank in the format", () => {
    const en = tFor("en");
    expect(partQty(en, { qty: "73.1666666667", unit: "ft" }, "mm")).toBe("22301 mm");
    expect(partQty(en, { qty: "10", unit: "ft" }, "ftin")).toBe("10′");
    const coil = parts.find((p) => p.key.startsWith("coil."))!;
    expect(partName(en, coil, "mm")).toContain("302 mm");
    expect(partName(en, coil)).toContain("11⅞″");
  });
});

/** the guard: a length reaches a person only through fmtLen(…, the company's format). ftIn( stays inside format.ts and in
 *  the files the second PR of #1092 moves to the same entry (the canvas and the input window): the list only shrinks */
describe("guard: no length of its own", () => {
  const MODULE = join(__dirname, "../src/modules/gutters");
  const STILL = new Set(["draw/CornerSketch.tsx", "draw/DrawScreen.tsx", "draw/AttrPanel.tsx"]);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : /\.tsx?$/.test(n) ? [join(dir, n)] : []));
  it("ftIn( is called only in format.ts and the listed files", () => {
    const bad = walk(MODULE)
      .map((f) => relative(MODULE, f))
      .filter((f) => f !== "canvas/format.ts" && !STILL.has(f))
      .filter((f) => /\bftIn\(/.test(readFileSync(join(MODULE, f), "utf8")));
    expect(bad).toEqual([]);
  });
  it("a listed file that no longer needs it leaves the list", () => {
    for (const f of STILL) expect(/\bftIn\(/.test(readFileSync(join(MODULE, f), "utf8")), `${f} has no ftIn( — remove it from STILL`).toBe(true);
  });
});
