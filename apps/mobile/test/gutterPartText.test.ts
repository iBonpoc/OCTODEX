import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts, type PartQty } from "@octo/estimating-engine";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { measureSpec } from "../src/modules/gutters/view/spec";
import { drawingPdfHtml } from "../src/modules/gutters/view/drawingPdf";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { partName, partQty } from "../src/modules/gutters/prices";

/** #1090: the crew's PDF and the parts list read as words and feet-inches — no «73.16666666666667 фт», no «touch_up_paint». */
const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs });
const d: Drawing = {
  // 73′ 2″ on the wall: a length that is not whole feet
  runs: [r("a", [0, 0], [73 * 12 + 2, 0]), r("b", [73 * 12 + 2, 0], [73 * 12 + 2, 15 * 12])],
  downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d1", runId: "a", atIn: 6, elbows: [{ style: "A", qty: 2 }] }],
};
const parts = computeGutterParts(toMeasurement(d)).parts;
const spec = measureSpec(d, parts);
const company = { name: "Test Gutters LLC", licenses: [], contacts: [] };
const crew = (lang: "en" | "es" | "ru") =>
  drawingPdfHtml({ kind: "crew", drawing: d, spec, t: tFor(lang), opts: { lang }, company, rough: false, date: "11/10/2026" });
const partsBlock = (h: string) => h.slice(h.indexOf("<h2>", h.lastIndexOf("</table>") - 4000));

describe("parts for a person (#1090)", () => {
  const p = (qty: string, unit: PartQty["unit"]): Pick<PartQty, "qty" | "unit"> => ({ qty, unit });
  it("feet are feet-inches-eighths, never a long decimal", () => {
    const en = tFor("en");
    expect(partQty(en, p("73.16666666666667", "ft"))).toBe("73′ 2″");
    expect(partQty(en, p("10", "ft"))).toBe("10′");
    expect(partQty(en, p("11.875", "ft"))).toBe("11′ 10½″");
    expect(partQty(tFor("ru"), p("73.16666666666667", "ft"))).toBe("73′ 2″");
  });
  it("a count is whole or to two places, with its unit word in the document's language", () => {
    expect(partQty(tFor("en"), p("24", "ea"))).toBe("24 ea");
    expect(partQty(tFor("ru"), p("2.5", "lb"))).toMatch(/^2\.5 /);
    expect(partQty(tFor("ru"), p("2.3333333", "lb"))).toMatch(/^2\.33 /);
  });
  it("every part of the sample job has a name with no bare code and no long decimal, in en / es / ru", () => {
    for (const lang of ["en", "es", "ru"] as const) {
      const t = tFor(lang);
      for (const q of parts) {
        const n = partName(t, q);
        expect(n, `${lang} ${q.key}`).not.toMatch(/\d\.\d{3,}/);
        expect(n, `${lang} ${q.key}`).not.toMatch(/touch_up_paint|(^|· )rivet( ·|$)|(^|· )coil( ·|$)|dsstick|aluminum|_/);
      }
    }
  });
  it("the named parts: rivet and touch-up paint have words, the coil says its blank in feet-inches", () => {
    const en = tFor("en");
    const names = parts.map((q) => partName(en, q));
    expect(names.join("|")).toMatch(/Pop rivet/);
    expect(names.join("|")).toMatch(/Touch-up paint/);
    expect(names.join("|")).toMatch(/Seamless coil/);
    expect(names.join("|")).toMatch(/11′ 10[⅞½]″|11′ 7⅞″|0′|11′/);
    expect(partName(tFor("ru"), parts.find((q) => q.attrs.part === "touch_up_paint")!)).toContain("Краска");
    expect(partName(tFor("es"), parts.find((q) => q.attrs.part === "touch_up_paint")!)).toContain("Pintura");
  });
});

describe("the crew's PDF (#1090)", () => {
  for (const lang of ["en", "es", "ru"] as const) {
    it(`parts table in ${lang}: feet-inches and words`, () => {
      const h = partsBlock(crew(lang));
      expect(h).not.toMatch(/\d\.\d{3,}/);
      expect(h).not.toMatch(/touch_up_paint|(^|· )rivet( ·|$)|(^|· )coil( ·|$)|dsstick|aluminum/);
      expect(h).toContain("′");
    });
  }
});
