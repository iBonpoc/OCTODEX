/**
 * The inset of a short gutter on the sheet (#1190, review of #1201): two or three short ones in a row (each corner said once),
 * the storey in the inset's length, long words (es) side by side, a short one at the end of a polyline (a cap), the branch with
 * no room (the old dimension line), every language and width. The sheet of the view and of the PDF is one function.
 */
import { drawingPrint as DP } from "@octo/design-tokens";
import { describe, expect, it } from "vitest";
import type { DocPrim } from "../src/features/docPages";
import { tFor, type Lang } from "../src/i18n/translate";
import { fmtLen } from "../src/modules/gutters/canvas/format";
import { findCorners, runLengthIn, type Drawing, type DrawnRun, type P } from "../src/modules/gutters/geometry";
import { blueprint } from "../src/modules/gutters/view/blueprint";
import { kim } from "./fixtures/kimSheet";

const attrs = (story = 1) => ({ profile: "k" as const, size: "5", material: "aluminum", color: "white", story, hanger: "hidden" as const });
const run = (id: string, a: P, b: P, story = 1): DrawnRun => ({ id, a, b, attrs: attrs(story) });
const stamp = { company: "Co", address: "1 Main St", date: "11/11/2026", rough: false };
const ft = (f: number, i = 0) => f * 12 + i;

/** a long one, then 2′ 6″ and 3′ 4″ at right angles, then a long one: three corners */
const zig = (story2 = 1): Drawing => ({
  runs: [run("a", [0, 0], [0, ft(300)]), run("b", [0, ft(300)], [ft(2, 6), ft(300)], story2), run("c", [ft(2, 6), ft(300)], [ft(2, 6), ft(300) + ft(3, 4)], story2), run("d", [ft(2, 6), ft(300) + ft(3, 4)], [ft(220), ft(300) + ft(3, 4)])],
  downspouts: [],
});
/** a long one ending in a short one with a free end (a cap) */
const stub: Drawing = { runs: [run("a", [0, 0], [0, ft(300)]), run("b", [0, ft(300)], [ft(2, 11), ft(300)])], downspouts: [] };
/** a staircase of six short steps next to a long one */
const stairs = (): Drawing => {
  const rs: DrawnRun[] = [run("a", [0, 0], [0, ft(300)])];
  let p: P = [0, ft(300)];
  for (let i = 0; i < 6; i++) {
    const q: P = i % 2 ? [p[0], p[1] + ft(2, 3 + i)] : [p[0] + ft(2, 3 + i), p[1]];
    rs.push(run(`s${i}`, p, q));
    p = q;
  }
  return { runs: rs, downspouts: [] };
};

const rectsOf = (items: DocPrim[]) => items.filter((p): p is Extract<DocPrim, { t: "r" }> => p.t === "r");
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

function sane(d: Drawing, lang: Lang, width: number) {
  const t = tFor(lang);
  const s = blueprint(d, t, stamp, width);
  const tx = s.items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x").map((p) => p.s);
  const rs = rectsOf(s.items);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `${lang} ${width}: labels ${i}/${j} overlap`).toBe(false);
  // every length once (with the storey when there are several)
  const many = new Set(d.runs.map((r) => r.attrs.story)).size > 1;
  const want = new Map<string, number>();
  for (const r of d.runs) {
    const len = fmtLen(runLengthIn(r), "ftin");
    const e = many ? `${len} · ${t("mod.gutters.story", { n: Number(r.attrs.story) })}` : len;
    want.set(e, (want.get(e) ?? 0) + 1);
  }
  for (const [e, n] of want) expect(tx.filter((x) => x === e), `${lang} ${width}: «${e}»`).toHaveLength(n);
  // every corner's word once
  const words = ["mod.gutters.draw.cornerIn", "mod.gutters.draw.cornerOut", "mod.gutters.draw.cornerBay"].map((k) => t(k as never));
  const said = tx.filter((x) => words.some((w) => x.startsWith(`${w} `) && x.endsWith("°")));
  expect(said, `${lang} ${width}: corners said`).toHaveLength(findCorners(d).length);
  for (const p of s.items) if (p.t === "l") for (const v of [p.x1, p.x2]) expect(v >= 0 && v <= s.w, "a line inside the sheet").toBe(true);
  return { s, tx };
}

describe("short gutters in insets: every corner once, every length once, in every language and width", () => {
  for (const lang of ["ru", "en", "es"] as const)
    for (const width of [390, DP.pageW, DP.sheetW]) {
      it(`${lang} ${width}: two short ones in a row (3 corners), a stub with a cap, six short steps`, () => {
        sane(zig(), lang, width);
        sane(stub, lang, width);
        sane(stairs(), lang, width);
      });
    }
});

describe("the inset keeps the storey (the crew needs it, in the PDF too)", () => {
  it("«2′ 6″ · эт 2» is in the inset, once, when there are several storeys", () => {
    const { tx } = sane(zig(2), "ru", DP.sheetW);
    expect(tx.filter((x) => x === "2′ 6″ · эт 2")).toHaveLength(1);
    expect(tx.filter((x) => x === "3′ 4″ · эт 2")).toHaveLength(1);
    expect(tx.filter((x) => /^№\d$/.test(x)).length).toBeGreaterThan(0);
  });
});

describe("the sheet of the view and of the PDF is one function", () => {
  it("the same arguments, the same items — the PDF page is the sheet's items", async () => {
    const { sheetPage } = await import("../src/modules/gutters/view/blueprint");
    const s = blueprint(zig(), tFor("ru"), stamp, DP.sheetW);
    expect(sheetPage("x", "t", s).items).toBe(s.items);
    expect(blueprint(zig(), tFor("ru"), stamp, DP.sheetW).items).toEqual(s.items);
  });
});

describe("the founder's sample in every language", () => {
  for (const lang of ["ru", "en", "es"] as const)
    for (const width of [390, DP.pageW, DP.sheetW])
      it(`${lang} ${width}: no label on another, the bay's and the corner's words side by side in the inset`, () => {
        const s = blueprint(kim, tFor(lang), stamp, width);
        const rs = rectsOf(s.items);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `labels ${i}/${j} overlap`).toBe(false);
        const t = tFor(lang);
        const said = s.items.filter((p): p is Extract<DocPrim, { t: "x" }> => p.t === "x" && /°$/.test(p.s) && [t("mod.gutters.draw.cornerIn"), t("mod.gutters.draw.cornerOut"), t("mod.gutters.draw.cornerBay")].some((w) => p.s.startsWith(`${w} `)));
        expect(said).toHaveLength(findCorners(kim).length);
      });
});
