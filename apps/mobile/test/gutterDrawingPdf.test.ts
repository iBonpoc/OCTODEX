import { print } from "@octo/design-tokens";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { computeGutterParts } from "@octo/estimating-engine";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { measureSpec } from "../src/modules/gutters/view/spec";
import { drawingPdfHtml, drawingPdfName } from "../src/modules/gutters/view/drawingPdf";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";

/** «Чертёж в PDF» (#509): for the client — no prices, the client's language; for the crew — the cut and the parts. */
const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
const d: Drawing = {
  runs: [r("a", [0, ft(10)], [ft(10), ft(10)]), r("b", [ft(10), ft(10)], [ft(10), 0]), r("c", [ft(-30), ft(-30)], [ft(-20), ft(-30)], { attrs: { ...attrs, story: 2 } })],
  downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d1", runId: "a", atIn: 6, elbows: [{ style: "A", qty: 2 }] }],
};
const parts = computeGutterParts(toMeasurement(d)).parts;
const spec = measureSpec(d, parts);
const company = { name: "Test Gutters LLC", licenses: [], contacts: [] };
const make = (kind: "client" | "crew", lang: "en" | "es" | "ru", rough = true) =>
  drawingPdfHtml({ kind, drawing: d, spec, t: tFor(lang), opts: { lang }, company, who: "Kevin Brooks", address: "12 Oak St", rough, date: "11/10/2026" });

describe("the drawing as a PDF", () => {
  it("for the client: the drawing, the gutters with lengths — no prices, no cut, no parts", () => {
    const h = make("client", "en");
    expect(h).toContain("<svg");
    expect(h).toContain("Gutter drawing");
    expect(h).toContain("Length");
    expect(h).not.toMatch(/\$\s?\d/);
    expect(h).not.toContain("At the face");
    expect(h).not.toContain("Parts");
    expect(h).toContain("Downspouts: 1");
  });
  it("for the client, in the client's language (rule 7): Spanish words, US formats", () => {
    const h = make("client", "es");
    expect(h).toContain("Plano de canaletas");
    expect(h).toContain("Largo");
    expect(h).toContain("11/10/2026");
    expect(h).not.toContain("Gutter drawing");
  });
  it("for the crew: along the wall and along the face, the corner's cut, the downspout's fittings, the parts", () => {
    const h = make("crew", "ru");
    expect(h).toContain("Раскрой для бригады");
    expect(h).toContain("По стене");
    expect(h).toContain("По лицевой");
    expect(h).toContain("Углы");
    expect(h).toContain("колен 2");
    expect(h).toContain("Детали");
    expect(h).not.toMatch(/\$\s?\d/);
  });
  it("the storey is a word on the drawing, never a colour (rule 2): one ink for every line", () => {
    const h = make("crew", "ru");
    expect(h).toContain("эт 2");
    // only print inks (the sheet's extension lines are grey — a drawing convention, not a storey), every gutter one ink
    const strokes = new Set([...h.matchAll(/<line[^>]*stroke="([^"]+)"/g)].map((m) => m[1]));
    expect([...strokes].every((c) => c === print.ink || c === print.mut)).toBe(true);
    const gutters = new Set([...h.matchAll(/<line[^>]*stroke="([^"]+)" stroke-width="2.5"/g)].map((m) => m[1]));
    expect([...gutters]).toEqual([print.ink]);
  });
  it("rough → «measure again before cutting»; by tape → no such note", () => {
    expect(make("crew", "en", true)).toContain("measure again before cutting");
    expect(make("crew", "en", false)).not.toContain("measure again before cutting");
  });
  it("a text a person typed is escaped", () => {
    const h = drawingPdfHtml({ kind: "client", drawing: d, spec, t: tFor("en"), opts: { lang: "en" }, company, who: "<b>x</b>", rough: false, date: "11/10/2026" });
    expect(h).not.toContain("<b>x</b>");
  });
  it("the file's name: the document and who it is for, no slashes", () => {
    expect(drawingPdfName("client", tFor("en"), "Kevin/Brooks")).toBe("Gutter drawing KevinBrooks");
  });
});
