/**
 * P4b-2 (#705, S6g; spec 33 П24.7): the measurement's drawing as the estimate's attached page — the sheet «как на
 * бумаге» (#739) in the client's language. «Сделать смету» puts it in, «Перенести изменения» replaces this
 * measurement's page only, a page the server would refuse never stalls the estimate, and the page carries no money and
 * no notes of the company (security-check of #727 №7).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import type { EstimateDoc } from "../src/data/types";
import { newDoc } from "../src/features/estimateDoc";
import { clientDoc } from "../src/features/estimateDoc";
import { pagesProblem, type DocAttachPage } from "../src/features/docPages";
import { pageIdOf, withMeasurementPage } from "../src/modules/gutters/estimateLink";
import { blueprint, sheetPage } from "../src/modules/gutters/view/blueprint";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P): DrawnRun => ({ id, a, b, attrs });
const d: Drawing = { runs: [r("a", [0, 120], [240, 120]), r("b", [240, 120], [240, 0])], downspouts: [] };
const page = (lang: "en" | "es", rough = true) =>
  sheetPage(pageIdOf("m1"), tFor(lang)("mod.gutters.pdf.title"), blueprint(d, tFor(lang), { company: "Test Gutters LLC", address: "12 Oak St", date: "11/10/2026", rough }));
const other: DocAttachPage = { id: "other:1", title: "Another module", w: 10, h: 10, items: [] };

describe("unit:gutterEstimatePage — the drawing in the estimate", () => {
  it("«Сделать смету»: the page goes in, its id is the module's own per measurement, the server's rules pass it", () => {
    const doc = withMeasurementPage(newDoc(), "m1", page("en"));
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages![0]!.id).toBe("gutters:m1");
    expect(doc.pages![0]!.title).toBe("Gutter drawing");
    expect(pagesProblem(doc.pages)).toBeNull();
    expect(clientDoc(doc).pages).toHaveLength(1);
  });
  it("«Перенести изменения»: this measurement's page is replaced, another's stays", () => {
    const first: EstimateDoc = { ...newDoc(), pages: [other, page("en")] };
    const next = withMeasurementPage(first, "m1", page("en", false));
    expect(next.pages!.map((p) => p.id)).toEqual(["other:1", "gutters:m1"]);
    expect(next.pages![1]!.items.some((x) => x.t === "x" && x.s === tFor("en")("mod.gutters.sheet.accuracy"))).toBe(true);
  });
  it("in the client's language (rule 7): a Spanish client gets Spanish words", () => {
    const p = withMeasurementPage(newDoc(), "m1", page("es")).pages![0]!;
    expect(p.title).toBe(tFor("es")("mod.gutters.pdf.title"));
    expect(p.items.some((x) => x.t === "x" && /^Escala/.test(x.s))).toBe(true);
  });
  it("no money and no notes of the company on the page (security-check #727 №7): only the drawing's words", () => {
    const p = page("en");
    const words = p.items.filter((x) => x.t === "x").map((x) => (x as { s: string }).s);
    expect(words.join(" ")).not.toMatch(/\$|cost|margin|note/i);
    expect(p.note).toBeUndefined();
    expect(p.rows).toBeUndefined();
    expect(p.head).toBeUndefined();
  });
  it("a page the server would refuse is left out — the estimate itself goes, the other pages stay", () => {
    const huge: DocAttachPage = { ...page("en"), items: Array.from({ length: 3001 }, () => ({ t: "r" as const, x: 0, y: 0, w: 1, h: 1 })) };
    const first: EstimateDoc = { ...newDoc(), pages: [other] };
    expect(withMeasurementPage(first, "m1", huge).pages!.map((p) => p.id)).toEqual(["other:1"]);
    expect("pages" in withMeasurementPage(newDoc(), "m1", huge)).toBe(false);
  });
});
