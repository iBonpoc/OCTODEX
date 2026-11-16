/**
 * #1766 «Просмотр замера»: the parts as a person reads them (DS §8.14) — a name in one line, the properties in words in
 * the human order, no twin rows, the downspouts with what the estimate counts for them; the estimate's line names in
 * the client's language, and «Обновить смету» renames the lines nobody renamed by hand.
 */
import { describe, expect, it } from "vitest";
import { computeGutterParts, resolveGutterRules, type PartQty } from "@octo/estimating-engine";
import { tFor } from "../src/i18n/translate";
import type { DrawnRun, Drawing, P } from "../src/modules/gutters/geometry";
import { toMeasurement } from "../src/modules/gutters/geometry";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { partName, partView, sampleJob, sizeText } from "../src/modules/gutters/prices";
import { dsNumbers, foldDs, measureSpec, partGroups } from "../src/modules/gutters/view/spec";
import { linesFromParts, resyncLines } from "../src/modules/gutters/estimate";

const LANGS = ["ru", "en", "es"] as const;
const stock = { profile: "k" as const, size: "5", material: "aluminum", gauge: ".027", finish: "painted", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, x: Partial<typeof stock> = {}): DrawnRun => ({ id, a, b, attrs: { ...stock, ...x } as DrawnRun["attrs"] });
/** an L of two gutters, three downspouts the same and one round corrugated with offsets */
const d: Drawing = {
  runs: [run("a", [0, 0], [400, 0]), run("b", [400, 0], [400, 300])],
  downspouts: [
    { ...DEFAULT_DS_ATTRS, id: "d1", runId: "a", atIn: 60 },
    { ...DEFAULT_DS_ATTRS, id: "d2", runId: "a", atIn: 200 },
    { ...DEFAULT_DS_ATTRS, id: "d3", runId: "a", atIn: 340 },
    { ...DEFAULT_DS_ATTRS, id: "d4", runId: "b", atIn: 150, shape: "round", size: "3", dsStyle: "corrugated", offsets: [{ lengthIn: 2, qty: 1 }] },
  ],
};
const parts = computeGutterParts(toMeasurement(d)).parts;
const sectional = computeGutterParts(toMeasurement(d), { seamless: false }).parts;

/** a code a person must never read: snake_case, a bare word in latin lower case, «.027», «2x3», a bare number */
const RAW = /^[a-z][a-z_]*$|^\.\d|\d+x\d+|^\d+(\.\d+)?$/;

describe("#1766 a part's name and properties in words (DS §8.14)", () => {
  it("thickness «0.027″», rivet «№42» / «#42», elbow «тип A», size «2×3″», gutter «K 5″» — never a code", () => {
    const ru = tFor("ru");
    const en = tFor("en");
    const rivet = parts.find((p) => p.attrs.part === "rivet")!;
    expect(partView(ru, rivet).props).toContain("№42");
    expect(partView(en, rivet).props).toContain("#42");
    const gutter = parts.find((p) => p.key.startsWith("gutter."))!;
    expect(partView(ru, gutter).props).toEqual(expect.arrayContaining(["K 5″", "0.027″"]));
    const elbow = parts.find((p) => p.attrs.part === "elbow" && p.attrs.shape === "rect")!;
    expect(partView(ru, elbow).title).toBe("Колено, тип A");
    expect(partView(en, elbow).title).toBe("Elbow, type A");
    expect(partView(ru, elbow).props).toContain("2×3″");
    const round = parts.find((p) => p.attrs.part === "elbow" && p.attrs.shape === "round")!;
    expect(partView(ru, round).title).toMatch(/^Колено, \d+°$/);
    expect(sizeText("2x3")).toBe("2×3″");
    expect(sizeText("3")).toBe("3″");
  });
  it("the twins have their own names: the coil to buy, the downspout's sticks, the left and right end caps", () => {
    const ru = tFor("ru");
    expect(partView(ru, parts.find((p) => p.attrs.buy === "coil")!).title).toMatch(/^Бесшовный рулон \d+′? ?\d*[⅛¼⅜½⅝¾⅞]?″$/);
    expect(partView(ru, parts.find((p) => p.attrs.stickIn)!).title).toBe("Водосток, хлыст 10′");
    const caps = parts.filter((p) => p.attrs.part === "end_cap").map((p) => partView(ru, p, "ftin", { side: true }).title);
    expect(caps.sort()).toEqual(["Заглушка, левая", "Заглушка, правая"]);
    // the estimate and the price list have one item for both: no side in the line's name
    expect(new Set(parts.filter((p) => p.attrs.part === "end_cap").map((p) => partName(ru, p))).size).toBe(1);
    expect(partView(ru, sectional.find((p) => p.attrs.buy === "section")!).title).toBe("Желоб, секции 10′");
  });
  it("every property of every part — seamless and sectional, rect and round — is a word or a number with its unit, in ru / en / es", () => {
    for (const lang of LANGS) {
      const t = tFor(lang);
      for (const p of [...parts, ...sectional].filter((x) => x.kind === "material")) {
        const v = partView(t, p, "ftin", { side: true });
        expect(v.title, `${lang} ${p.key}`).not.toMatch(/_|\d+x\d+/);
        for (const x of v.props) expect(x, `${lang} ${p.key}: «${x}»`).not.toMatch(RAW);
      }
    }
  });
  it("the rare parts too — wall fasteners, guards, eave boxes, reducers, drains, half-round shanks and bolts, copper — have no code left", () => {
    const base = sampleJob({});
    const jobs: (typeof base)[] = [];
    for (const wall of ["wood", "stucco", "brick"])
      for (const shape of ["rect", "round"] as const) {
        const m = structuredClone(base);
        m.downspouts[0] = { ...m.downspouts[0]!, wall, shape, size: shape === "round" ? "3" : "2x3", offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 7, qty: 1 }], reducers: [{ to: "2x3", qty: 1 }], head: "conductor", diverter: true, outletScreen: true, eaveBox: "open", bottom: { kind: "drain", pipe: "4" } };
        jobs.push(m);
      }
    for (const [profile, hanger] of [["half_round", "hr_shank_fascia"], ["k", "spike"], ["k", "tbar_strap"], ["box", "hidden"]] as const) {
      const m = structuredClone(base);
      for (const r of m.runs) Object.assign(r, { profile, hanger, guardsIn: r.lengthIn, guard: "micromesh", material: "copper", gauge: "16oz" });
      for (const c of m.corners) Object.assign(c, { profile, material: "copper" });
      jobs.push(m);
    }
    for (const lang of LANGS)
      for (const m of jobs)
        for (const p of computeGutterParts(m).parts.filter((x) => x.kind === "material")) {
          const v = partView(tFor(lang), p, "ftin", { side: true });
          // a bare latin word is a code only in Russian (in English and Spanish «open», «abierta» are words)
          // founder 16.11: «водосток», never «труба» (pipe / tubo) — on the screen and in the PDF; «Pipe cleat» is a
          // product's trade name (as «Hinged hook»), the word of the canvas's wall-fastener choice too
          for (const x of [v.title, ...v.props]) expect(x.replace(/Pipe cleat/, ""), `${lang} ${p.key}: «${x}»`).not.toMatch(/труб|pipe|tubo/i);
          for (const x of [v.title, ...v.props]) expect(x, `${lang} ${p.key}: «${x}»`).not.toMatch(lang === "ru" ? /_|^[a-z]+$|^\.\d|\d+x\d+|^\d+(\.\d+)?$/ : /_|^\.\d|\d+x\d+|^\d+(\.\d+)?$/);
        }
  });
  it("the human order: size and profile first, then the metal and its thickness, then the colour and finish", () => {
    const v = partView(tFor("en"), parts.find((p) => p.attrs.part === "rivet")!);
    const at = (s: string) => v.props.findIndex((x) => x.includes(s));
    expect(at("Aluminum")).toBeLessThan(at("White"));
    const g = partView(tFor("en"), parts.find((p) => p.key.startsWith("gutter."))!).props;
    expect(g[0]).toMatch(/^K(-style)? 5″$/);
    expect(g.indexOf("0.027″")).toBeLessThan(g.indexOf("White"));
  });
});

describe("#1766 «Состав замера»: three groups, no twin rows", () => {
  for (const lang of LANGS) {
    it(`${lang}: gutter · downspout · fasteners and supplies; one row per thing; «купить» on what is only bought`, () => {
      const t = tFor(lang);
      const spec = measureSpec(d, parts);
      const gs = partGroups(t, spec.parts);
      expect(gs.map((g) => g.key)).toEqual(["gutter", "ds", "fix"]);
      for (const g of gs) {
        const seen = g.rows.map((r) => [r.title, ...r.props].join("|"));
        expect(new Set(seen).size, `${lang} ${g.key}: ${seen.join(" / ")}`).toBe(seen.length);
        for (const r of g.rows) {
          expect(r.qty).toMatch(/\d/);
          expect(r.qty).not.toMatch(/\d\.\d{3,}/);
        }
      }
      const buy = t("mod.gutters.view.buy");
      const coil = gs[0]!.rows.find((r) => r.key.startsWith("coil."))!;
      expect(coil.props).toContain(buy);
      expect(gs[0]!.rows.find((r) => r.key.startsWith("gutter."))!.props).not.toContain(buy);
    });
  }
  it("a property every row of a group has is said once, in the group's caption", () => {
    const t = tFor("ru");
    const g = partGroups(t, measureSpec(d, parts).parts)[0]!;
    expect(g.common).toEqual(expect.arrayContaining(["K 5″", "Белый"]));
    for (const r of g.rows) for (const c of g.common) expect(r.props).not.toContain(c);
  });
  it("the same rows add up in the engine's decimals", () => {
    const p = (qty: string): PartQty => ({ key: `x${qty}`, section: "consumables", qty, unit: "ea", use: "both", kind: "material", attrs: { part: "sealant" } });
    const g = partGroups(tFor("en"), [p("1"), p("2")]);
    expect(g).toHaveLength(1);
    expect(g[0]!.rows).toHaveLength(1);
    expect(g[0]!.rows[0]!.qty).toBe("3 ea");
  });
});

describe("#1766 «Водостоки»: what the estimate counts, the same ones folded", () => {
  it("each downspout's pipe length is the engine's (storey × storey height + extension); D1–D3 are one row", () => {
    const rules = resolveGutterRules();
    const spec = measureSpec(d, parts);
    expect(spec.ds.every((x) => x.lengthIn === rules.storyHeightIn + rules.dsExtensionIn)).toBe(true);
    expect(spec.ds[3]).toMatchObject({ shape: "round", dsStyle: "corrugated", offsets: [{ lengthIn: 2, qty: 1 }], bottom: "extension" });
    const folded = foldDs(spec.ds);
    expect(folded.map((f) => f.ns)).toEqual([[1, 2, 3], [4]]);
    const t = tFor("ru");
    expect(dsNumbers(t, [1, 2, 3])).toBe("D1–D3");
    expect(dsNumbers(t, [1, 4])).toBe("D1, D4");
    expect(dsNumbers(t, [2])).toBe("D2");
  });
  it("a second storey: a downspout from it is longer, and only then «эт N» is said", () => {
    const two: Drawing = { ...d, runs: [d.runs[0]!, run("b", [400, 0], [400, 300], { story: 2 } as never)] };
    const spec = measureSpec(two, computeGutterParts(toMeasurement(two)).parts);
    expect(spec.manyStories).toBe(true);
    expect(measureSpec(d, parts).manyStories).toBe(false);
    expect(spec.ds[3]!.lengthIn).toBeGreaterThan(spec.ds[0]!.lengthIn);
  });
});

describe("#1766 the estimate's lines: words in the client's language; «Обновить» renames what nobody renamed", () => {
  let n = 0;
  const uid = () => `l${++n}`;
  it("a part without a price-list item is named in the client's language, never a code", () => {
    for (const lang of LANGS) {
      const t = tFor(lang);
      const lines = linesFromParts(parts, [], (p) => partName(t, p), uid);
      for (const l of lines) expect(l.name, `${lang}: ${l.name}`).not.toMatch(/\bhidden\b|\bplain\b|\bcorrugated\b|\d+x\d+|(^|· )\.\d|(^|· )\d+( ·|$)|_/);
    }
    const es = linesFromParts(parts, [], (p) => partName(tFor("es"), p), uid).map((l) => l.name).join(" | ");
    expect(es).toMatch(/Canaleta/);
    expect(es).not.toMatch(/Желоб|Gutter\b/);
  });
  it("lines written with the old names: untouched ones take the new words, a name changed by hand stays", () => {
    const old = linesFromParts(parts, [], (p) => `${p.key}`, uid);
    const renamed = old.map((l, i) => (i === 0 ? { ...l, name: "My own name" } : l));
    const next = linesFromParts(parts, [], (p) => partName(tFor("en"), p), uid);
    const out = resyncLines(renamed, next);
    expect(out[0]!.name).toBe("My own name");
    for (const l of out.slice(1)) expect(l.name).toBe(next.find((x) => (x.source as { key: string }).key === (l.source as { key: string }).key)!.name);
  });
});
