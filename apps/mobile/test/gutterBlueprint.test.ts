/**
 * «Чертёж как на бумаге» (founder 10.11, #739; spec 33 П24.8): the measurement as a drawing sheet — a dimension line
 * with extension lines and ticks by every gutter, its length over it, the number in a circle, «эт N» only with more
 * than one storey, downspouts «D1», corners with their angle, the title block, and no text on top of another.
 */
import { drawingPrint as DP } from "@octo/design-tokens";
import { describe, expect, it } from "vitest";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { blueprint, scaleBarFt, sheetPage } from "../src/modules/gutters/view/blueprint";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { clientPages, pagesProblem, type DocPrim } from "../src/features/docPages";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, o: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...o });
const ft = (n: number) => n * 12;
/** an L (a corner) and a run apart from it — on one scale (a far-away contour gets its own panel, see below) */
const d: Drawing = {
  runs: [r("a", [0, ft(10)], [ft(10), ft(10)], { lengthIn: ft(10) }), r("b", [ft(10), ft(10)], [ft(10), 0]), r("c", [ft(-6), ft(-8)], [ft(-1), ft(-8)])],
  downspouts: [{ ...DEFAULT_DS_ATTRS, id: "d1", runId: "a", atIn: 6 }],
};
const t = tFor("ru");
const stamp = { company: "Test Gutters LLC", address: "4512 Ventura Canyon Ave", date: "11/10/2026", rough: true };
const texts = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x").map((p) => p.s);

describe("unit:gutterBlueprint — the drawing as on paper", () => {
  const s = blueprint(d, t, stamp);

  it("every gutter: its line, a dimension line with two extension lines and two ticks, its length over it", () => {
    const lines = s.items.filter((p): p is Extract<DocPrim, { t: "l" }> => p.t === "l");
    expect(lines.filter((l) => l.sw === DP.runW)).toHaveLength(3);
    // per gutter: 2 extension (thin, grey) + 2 ticks + the dimension line
    expect(lines.filter((l) => l.ink === "mut" && l.sw === DP.thinW)).toHaveLength(6);
    expect(texts(s.items)).toEqual(expect.arrayContaining(["10′", "5′"]));
  });

  it("the number of every gutter in a circle; a downspout «D1»; a corner with its angle", () => {
    expect(texts(s.items)).toEqual(expect.arrayContaining(["1", "2", "3", "D1"]));
    expect(s.items.filter((p) => p.t === "c" && p.r === DP.numR)).toHaveLength(3);
    expect(texts(s.items).some((x) => /^(наруж\.|внутр\.) 90°$/.test(x))).toBe(true);
  });

  it("the storey as a word only when there is more than one storey (rule 2: never a colour)", () => {
    expect(texts(s.items).some((x) => x.includes("эт "))).toBe(false);
    const two = blueprint({ ...d, runs: d.runs.map((x, i) => (i === 2 ? { ...x, attrs: { ...attrs, story: 2 } } : x)) }, t, stamp);
    expect(texts(two.items)).toEqual(expect.arrayContaining(["10′ · эт 1", "5′ · эт 2"]));
  });

  it("no text lands on another (the snapshot: «5′ 4″ · эт 1» over D2)", () => {
    const boxes = s.items.filter((p): p is Extract<DocPrim, { t: "r" }> => p.t === "r");
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const over = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(over, `${i} × ${j}`).toBe(false);
      }
  });

  it("the drawing fits the sheet; the title block: company, address, date, rough, a scale", () => {
    expect(s.w).toBe(DP.sheetW);
    for (const p of s.items) {
      const [x, y] = p.t === "l" ? [p.x1, p.y1] : p.t === "c" || p.t === "d" ? [p.cx, p.cy] : [p.x, p.y];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(s.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(s.h);
    }
    const all = texts(s.items);
    expect(all).toEqual(expect.arrayContaining(["Test Gutters LLC", "4512 Ventura Canyon Ave", "11/10/2026", t("mod.gutters.view.rough")]));
    expect(all.some((x) => x.startsWith("Масштаб:"))).toBe(true);
    expect(texts(blueprint(d, t, { ...stamp, rough: false }).items)).toContain(t("mod.gutters.sheet.tape"));
  });

  it("no prices on the sheet", () => {
    expect(texts(s.items).join(" ")).not.toMatch(/\$/);
  });

  it("the client's language: the sheet in Spanish has Spanish words", () => {
    expect(texts(blueprint(d, tFor("es"), stamp).items).join(" ")).toContain("Escala");
  });

  it("the core's attached page: passes the page rules whole (the estimate's page, P4b-2)", () => {
    const page = sheetPage("gutters:m1", "Drawing", s);
    expect(pagesProblem([page])).toBeNull();
    expect(clientPages([page])[0]!.items).toHaveLength(s.items.length);
  });

  it("the scale bar: a round length near its size on the sheet", () => {
    expect(scaleBarFt(DP.scalePx / 120)).toBe(10);
    expect(scaleBarFt(DP.scalePx / 12)).toBe(1);
    expect(scaleBarFt(DP.scalePx / 600)).toBe(50);
  });
});
