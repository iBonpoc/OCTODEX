/**
 * Shop drawings of a measurement (#1349, founder 13.11): the plan sheets G-1 …, the schedules and materials, the
 * supplier's order. The reference job is the founder's G-1_G-2_Gutter_Drawings_Rev6 (test/gutterShopFixture.ts).
 */
import { describe, expect, it } from "vitest";
import { shopSheet as SS } from "@octo/design-tokens";
import { computeGutterParts } from "@octo/estimating-engine";
import { toMeasurement, type Drawing } from "@/modules/gutters/geometry";
import { readRules, toRulesOverride } from "@/modules/gutters/settings";
import { shopHtml, shopSheets } from "@/modules/gutters/view/shop";
import { fi, miterCutDeg, shopModel } from "@/modules/gutters/view/shop/model";
import { pickScale } from "@/modules/gutters/view/shop/plan";
import { materialRows, orderRows, segWord } from "@/modules/gutters/view/shop/schedules";
import { Sheet, fontPt, textW } from "@/modules/gutters/view/shop/sheet";
import { tFor } from "@/i18n/translate";
import { HARD, REF, ctxOf } from "./gutterShopFixture";

const text = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

describe("shop drawings: the measurement as a drawing reads it", () => {
  const m = shopModel(REF, 10);
  it("runs walked end to end, segments numbered run-segment, true lengths", () => {
    expect(m.chains.map((c) => c.segs.map((s) => s.tag))).toEqual([["1-1", "1-2", "1-3", "1-4"], ["2-1", "2-2"]]);
    expect(m.chains.map((c) => fi(c.totalIn))).toEqual(["146'-7\"", "104'-9\""]);
  });
  it("end caps are A (left) and B (right); a letter a kind of miter: C outside 90°, D bay 126° — one inside, one outside", () => {
    expect(m.tags.map((g) => [g.tag, g.kind, g.cornerKind, g.angleDeg, g.qty])).toEqual([["A", "capL", undefined, undefined, 2], ["B", "capR", undefined, undefined, 2], ["C", "miter", "out", 90, 2], ["D", "miter", "bay", 126, 2]]);
    expect(m.tags.map((g) => g.cut)).toEqual([0, 0, 2, 2]);
    expect(m.tags[3]).toMatchObject({ inward: 1, outward: 1 });
    expect(m.chains[0]!.segs[0]!.ends.map((e) => e.tag)).toEqual(["A", "C"]);
    expect(m.chains[1]!.segs[0]!.ends.map((e) => e.tag)).toEqual(["B", "C"]);
  });
  it("a downspout: its segment, the distance from the nearer end, what was measured — and nothing else", () => {
    expect(m.ds.map((d) => [d.tag, d.seg.tag, d.fromEndIn, d.dropIn])).toEqual([["DS1", "1-1", 24, 120], ["DS2", "1-4", 24, 120], ["DS3", "2-2", 24, 120]]);
    expect(m.ds[0]!.offsets).toBeUndefined();
  });
  it("the typed length wins over the sketch: the plan is laid out by the tape", () => {
    const d = { runs: [{ id: "a", a: [0, 0], b: [100, 0], lengthIn: 240, attrs: { profile: "k", size: "5", story: 1 } }, { id: "b", a: [100, 0], b: [100, 50], lengthIn: 120, attrs: { profile: "k", size: "5", story: 1 } }], downspouts: [] } as unknown as Drawing;
    const segs = shopModel(d).chains[0]!.segs;
    expect(segs.map((s) => [s.a, s.b])).toEqual([[[0, 0], [240, 0]], [[240, 0], [240, 120]]]);
  });
  it("feet-inches as a drawing writes them; a corner's cut is half its turn", () => {
    expect([fi(534), fi(346.5), fi(9), fi(195.5), fi(120.0625)]).toEqual(["44'-6\"", "28'-10 1/2\"", "0'-9\"", "16'-3 1/2\"", "10'-0 1/16\""]);
    expect([miterCutDeg(90), miterCutDeg(126), miterCutDeg(135)]).toEqual([45, 27, 22.5]);
  });
  it("the largest standard scale that fits the plan's field", () => {
    expect(pickScale(1007, 983).name).toBe('3/32" = 1\'-0"');
    expect(pickScale(480, 336).name).toBe('3/16" = 1\'-0"');
    expect(pickScale(200, 100).name).toBe('1/4" = 1\'-0"');
  });
});

describe("shop drawings: the sheets of the reference job", () => {
  const x = ctxOf(REF);
  const set = shopSheets(REF, x);
  const g1 = set.drawings[0]!.svg(), words = text(g1);
  it("a plan sheet, then the schedules; numbered G-1 …, «SHEET n OF N»", () => {
    expect(set.drawings.length).toBeGreaterThanOrEqual(2);
    set.drawings.forEach((s, i) => expect(text(s.svg())).toEqual(expect.arrayContaining([`G-${i + 1}`, `SHEET ${i + 1} OF ${set.drawings.length}`])));
    expect(words).toEqual(expect.arrayContaining(["GUTTER LAYOUT PLAN — LEVEL 1", "NOT FOR PERMIT", "URBANTECH", "BUILDERS"]));
  });
  it("nothing overlaps and nothing leaves the border — the check before saving", () => {
    expect([set.problems, set.orderProblems]).toEqual([[], []]);
  });
  it("the plan: the scale, every length as a dimension, an angle at every corner, the tags", () => {
    expect(words).toEqual(expect.arrayContaining(['SCALE: 3/32" = 1\'-0" ON 11×17 SHEET', "44'-6\"", "28'-10\"", "44'-2\"", "29'-1\"", "49'-7\"", "55'-2\""]));
    expect(words.filter((w) => w === "90°")).toHaveLength(2);
    expect(words.filter((w) => w === "126°")).toHaveLength(2);
    for (const tag of ["1-1", "1-2", "1-3", "1-4", "2-1", "2-2", "DS1", "DS2", "DS3", "RUN 1", "RUN 2", "146'-7\" TOTAL", "BUILDING", "SECTION A"]) expect(words, tag).toContain(tag);
    expect(words.filter((w) => w === "FACE")).toHaveLength(2);
    // A, B, C, D on the plan: 2 + 2 + 2 + 2, and each once more where the section and the legend use the letter
    expect(words.filter((w) => w === "C")).toHaveLength(2);
    expect(words.filter((w) => w === "D")).toHaveLength(2);
  });
  it("no tables on the plan sheet", () => {
    for (const head of ["RUN / SEG.", "DESCRIPTION", "QTY", "BASIS", "ELBOWS"]) expect(words, head).not.toContain(head);
  });
  it("the section's depth is not measured: «VERIFY», never a number", () => {
    expect(words).toEqual(expect.arrayContaining(['5" WIDTH', "DEPTH:", "VERIFY"]));
    expect(words.some((w) => /^\d+(\.\d+)?" DEPTH/.test(w))).toBe(false);
  });
  it("black and white: one gray — the gutter's band", () => {
    const colors = new Set([...set.drawings.map((s) => s.svg()).join("").matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)].map((c) => c[1]!.toUpperCase()));
    expect([...colors].sort()).toEqual(["#15161A", "#AFAFAF", "#FFFFFF"]);
  });
  it("the schedules: every segment with its ends and length, subtotals, the total; every downspout", () => {
    const all = set.drawings.slice(1).flatMap((s) => text(s.svg()));
    expect(all).toEqual(expect.arrayContaining(["End cap L to 90° outside miter", "126° bay miter to 126° bay miter", "Subtotal", "146'-7\"", "104'-9\"", "251'-4\"", "TOTAL"]));
    expect(all).toEqual(expect.arrayContaining(["Seg 1-1, 2'-0\" from end", "A ×2, B ×1", "B ×2", '4"', "10'-0\""]));
    // DS1's offsets were not measured: «TBD», not a guess
    expect(all).toContain("TBD");
    expect(segWord(x.t, shopModel(REF).chains[1]!.segs[1]!)).toBe("90° outside miter to end cap L");
  });
  it("the material list is the estimate's: the engine's quantities, each with its basis", () => {
    const rows = materialRows(x, shopModel(REF));
    const qty = (key: string) => Number(x.parts.find((p) => p.key.startsWith(key))!.qty);
    const row = (re: RegExp) => rows.find((r) => re.test(r.item))!;
    expect(row(/^Hanger/).qty).toBe(`${qty("hanger.")} ea`);
    expect(row(/^Hanger/).basis).toBe('24" o.c. + ends');
    expect(row(/Seamless coil/).qty).toBe(fi(qty("coil.") * 12));
    expect(row(/Seamless coil/).basis).toBe("251'-4\" + 10 ft waste per gutter stock");
    expect(rows.slice(0, 4).map((r) => [r.tag, r.qty, r.basis])).toEqual([["A", "2 ea", "Plan tag A"], ["B", "2 ea", "Plan tag B"], ["C", "2 ea", "45° cut each side"], ["D", "2 ea", "27° cut each side"]]);
    // every material of the estimate is on the list, none twice
    expect(rows.length).toBe(x.parts.filter((p) => p.kind === "material" && Number(p.qty) > 0).length + 2);
  });
  it("the order: what is bought (the coil, the sticks), not the finished lengths; in a Letter page's shape", () => {
    const rows = orderRows(x, shopModel(REF));
    expect(rows.some((r) => /Seamless coil/.test(r.item))).toBe(true);
    expect(rows.some((r) => r.basis === "Sum of segments" || r.basis === "Sum of drops")).toBe(false);
    // only what the engine says is bought (review of #1349): none of the estimate-only rows
    expect(rows.length).toBe(x.parts.filter((p) => p.kind === "material" && Number(p.qty) > 0 && p.use !== "estimate").length);
    expect(set.order).toHaveLength(1);
    expect(set.order[0]!.w / set.order[0]!.h).toBeCloseTo(8.5 / 11, 5);
    expect(text(set.order[0]!.svg())).toEqual(expect.arrayContaining(["MATERIAL ORDER", "SUPPLIER", "PO #", "DELIVER TO / PICKUP", "MO-1"]));
  });
});

describe("shop drawings: as the estimate counts (review of #1349)", () => {
  const withRules = (raw: object) => {
    const x = ctxOf(REF);
    const r = readRules(raw);
    return { ...x, rules: { ...x.rules, corner: r.corner }, parts: computeGutterParts(toMeasurement(REF, { method: r.corner }), toRulesOverride(raw)).parts };
  };
  it("a corner made of a ready part is the estimate's row, not «field-cut»: no C, D rows, no note of a cut", () => {
    const x = withRules({ rules: { corner: "prefab" } });
    expect(x.rules.corner).toBe("prefab");
    const m = shopModel(REF, 10, x.rules.corner);
    expect(m.tags.filter((g) => g.kind === "miter").map((g) => g.cut)).toEqual([0, 0]);
    const rows = materialRows(x, m);
    expect(rows.filter((r) => r.tag === "C" || r.tag === "D")).toEqual([]);
    expect(rows.length).toBe(x.parts.filter((p) => p.kind === "material" && Number(p.qty) > 0).length);
    const g1 = text(shopSheets(REF, x).drawings[0]!.svg()).join(" ");
    expect(g1).not.toContain("MITERS FIELD-CUT");
    // the tags stay on the plan: the corner is still there
    expect(text(shopSheets(REF, x).drawings[0]!.svg()).filter((w) => w === "C")).toHaveLength(2);
  });
  it("one corner's own choice wins over the company's", () => {
    const d = { ...REF, corners: { "c:a:b": { method: "prefab" } } } as Drawing;
    expect(shopModel(d, 10).tags.filter((g) => g.kind === "miter").map((g) => [g.tag, g.qty, g.cut])).toEqual([["C", 2, 1], ["D", 2, 2]]);
  });
  it("sectional gutters: the order has the sections, not also the finished length", () => {
    const x = withRules({ rules: { seamless: false } });
    const rows = orderRows(x, shopModel(REF, 10));
    expect(rows.some((r) => r.basis === "Sum of segments")).toBe(false);
    expect(rows.length).toBe(x.parts.filter((p) => p.kind === "material" && Number(p.qty) > 0 && p.use !== "estimate").length);
  });
  it("a gutter drawn end to start: the same caps, corner and downspout place", () => {
    const flip = { ...REF, runs: REF.runs.map((r) => (r.id === "a" ? { ...r, a: r.b, b: r.a } : r)), downspouts: REF.downspouts.map((s) => (s.runId === "a" ? { ...s, atIn: 534 - 24 } : s)) } as Drawing;
    const m = shopModel(flip, 10), first = m.chains[0]!.segs[0]!;
    expect([first.tag, first.forward, first.ends.map((e) => e.tag), fi(first.lengthIn)]).toEqual(["1-1", false, ["A", "C"], "44'-6\""]);
    expect([m.ds[0]!.seg.tag, m.ds[0]!.fromEndIn, m.ds[0]!.at]).toEqual(["1-1", 24, [0, 510]]);
  });
  it("a gutter lying on another is counted once, as in the estimate; a downspout of a gutter that is gone is not numbered", () => {
    const d = { runs: [REF.runs[4]!, { ...REF.runs[4]!, id: "twin" }, REF.runs[5]!], downspouts: [{ ...REF.downspouts[0]!, runId: "gone" }, REF.downspouts[2]!] } as Drawing;
    const m = shopModel(d, 10);
    expect(m.chains.map((c) => fi(c.totalIn))).toEqual(["104'-9\""]);
    expect(m.ds.map((s) => s.tag)).toEqual(["DS1"]);
  });
  it("what a person typed cannot break the page: the company, the client, the address", () => {
    const evil = '</text><script>alert(1)</script> & "Co" <b>';
    const html = shopHtml(shopSheets(REF, ctxOf(REF, "en", { company: { name: evil, lines: [evil] }, client: evil, address: evil })).drawings, "</title><script>x</script>");
    expect(html).not.toMatch(/<script|<b>|<\/text><s/);
    expect(html).toContain("&lt;/TEXT&gt;");
  });
});

describe("shop drawings: readable on Letter", () => {
  it("no text below 11 pt on the sheet — 7 pt when the sheet is reduced to Letter", () => {
    for (const [d, lang] of [[REF, "en"], [HARD, "ru"], [HARD, "es"]] as const) {
      const set = shopSheets(d, ctxOf(d, lang));
      for (const s of [...set.drawings, ...set.order]) {
        expect(s.minPt()).toBeGreaterThanOrEqual(SS.minPt - 0.01);
        const sizes = [...s.svg().matchAll(/font-size="([\d.]+)"/g)].map((q) => (Number(q[1]) / 96) * 72);
        expect(Math.min(...sizes) * (SS.letterWIn / SS.wIn)).toBeGreaterThanOrEqual(SS.letterMinPt);
      }
    }
    expect(fontPt(SS.textSm)).toBeGreaterThanOrEqual(11);
  });
  it("«Letter (reduced)»: the same sheet scaled to fit the page, nothing laid out again", () => {
    const set = shopSheets(REF, ctxOf(REF));
    const big = shopHtml(set.drawings, "x"), small = shopHtml(set.drawings, "x", "letter");
    expect(big).toContain("@page{size:11in 17in");
    expect(small).toContain("@page{size:8.5in 11in");
    expect(small).toContain(`width="${((11 * 11) / 17).toFixed(3)}in" height="11.000in"`);
    const body = (h: string) => h.replace(/<style>.*?<\/style>/, "").replace(/width="[\d.]+in" height="[\d.]+in"/g, "");
    expect(body(small)).toBe(body(big));
  });
});

describe("shop drawings: a hard measurement", () => {
  it("a closed outline, two storeys, a 2'-6\" stub, downspouts with nothing measured, a long company name — in every language", () => {
    for (const lang of ["en", "ru", "es"] as const) {
      const set = shopSheets(HARD, ctxOf(HARD, lang, { company: { name: "Acme Roofing & Sheet Metal of Southern California", lines: [] }, client: "John Smith", address: "123 Main St, Los Angeles, CA 90001" }));
      expect([set.problems, set.orderProblems], lang).toEqual([[], []]);
      // a plan a storey, then the schedules
      expect(text(set.drawings[1]!.svg()).some((w) => /LEVEL 2|ЭТАЖ 2|NIVEL 2/.test(w)), lang).toBe(true);
    }
  });
  it("what was not measured is «TBD»: elbows, offsets, a drop", () => {
    const x = ctxOf(HARD);
    const all = shopSheets(HARD, x).drawings.flatMap((s) => text(s.svg()));
    expect(all.filter((w) => w === "TBD").length).toBeGreaterThanOrEqual(4);
    // a downspout with no elbows measured is «—», not «TBD»: nothing is a measured answer
    const m = shopModel(HARD, x.rules.storyFt);
    expect(m.ds[2]!.elbows).toEqual([]);
    expect(m.ds[1]!.dropIn).toBe(120); // no own height: the storey by the company's storey height
  });
});

describe("shop drawings: the check before saving", () => {
  const sheet = () => new Sheet(11, 17, 0.375);
  it("two texts on one another, a line through a text, a text outside the border — each is a problem", () => {
    const a = sheet();
    a.draw("one", (p) => p.text("FIRST", 2, 2, 0.11));
    a.draw("two", (p) => p.text("SECOND", 2.2, 2, 0.11));
    expect(a.problems()).toHaveLength(1);
    const b = sheet();
    b.draw("word", (p) => p.text("WORD", 2, 2, 0.11));
    b.draw("rule", (p) => p.line([1, 2], [5, 2]));
    expect(b.problems()).toEqual(["“WORD” × line of rule"]);
    const c = sheet();
    c.draw("out", (p) => p.text("OUT", 10.5, 2, 0.11));
    expect(c.problems()).toEqual(["out is outside the border"]);
    const d = sheet();
    d.draw("one", (p) => p.text("FIRST", 2, 2, 0.11));
    d.draw("two", (p) => p.text("SECOND", 2, 2.3, 0.11));
    expect(d.problems()).toEqual([]);
  });
  it("a label takes the first free place; none — it is noted", () => {
    const s = sheet();
    s.draw("taken", (p) => p.text("TAKEN", 2, 2, 0.11));
    s.place("label", [(p) => p.text("L", 2.1, 2, 0.11), (p) => p.text("L", 2.1, 3, 0.11)]);
    expect([s.notes, s.problems()]).toEqual([[], []]);
    s.place("stuck", [(p) => p.text("S", 2.1, 2, 0.11)]);
    expect(s.notes).toEqual(["no free place for stuck"]);
  });
  it("a text's width is counted from Arial's metrics: Latin, Russian, the drawing's signs", () => {
    expect(textW("44'-6\"", 0.716)).toBeCloseTo((556 * 3 + 191 + 333 + 355) / 1000, 3);
    expect(textW("Ж", 0.716, true)).toBeGreaterThan(0.8);
    expect(tFor("ru")("mod.gutters.shop.planTitle")).toBe("План водостоков");
  });
});

describe("#1355: the coil's basis says the waste the engine counts", () => {
  const basisOf = (wasteFt: number) => {
    const c = ctxOf(REF);
    const x2 = { ...c, rules: { ...c.rules, wasteFt } };
    return materialRows(x2, shopModel(REF)).find((r) => /Seamless coil/.test(r.item))!.basis;
  };
  it("10 ft of waste for every gutter stock", () => expect(basisOf(10)).toBe("251'-4\" + 10 ft waste per gutter stock"));
  it("no waste: «no waste», not «+ 0 ft»", () => expect(basisOf(0)).toBe("251'-4\", no waste"));
});
