/** The founder's reference job (#1349, G-1_G-2_Gutter_Drawings_Rev6): two runs, a 126° bay, three downspouts. */
import { computeGutterParts } from "@octo/estimating-engine";
import { toMeasurement, type Drawing } from "@/modules/gutters/geometry";
import { readRules, toRulesOverride } from "@/modules/gutters/settings";
import type { ShopCtx } from "@/modules/gutters/view/shop";
import { tFor } from "@/i18n/translate";

const ft = (f: number, i: number) => f * 12 + i;
const at = { profile: "k", size: "5", material: "aluminum", gauge: ".032", finish: "painted", color: "black", story: 1, mount: "fascia", hanger: "hidden" } as const;
const c54 = Math.cos((54 * Math.PI) / 180), s54 = Math.sin((54 * Math.PI) / 180);
const p0 = [0, ft(44, 6)], p1 = [0, 0], p2 = [ft(28, 10), 0], p3 = [Math.round(p2[0]! + ft(44, 2) * c54), Math.round(-ft(44, 2) * s54)], p4 = [p3[0]! + ft(29, 1), p3[1]!];
const q0 = [Math.round(30.8 * 12), ft(44, 6) + Math.round(1.7 * 12)], q1 = [q0[0]! + ft(49, 7), q0[1]!], q2 = [q1[0]!, q1[1]! - ft(55, 2)];
const run = (id: string, a: number[], b: number[], lengthIn: number, story = 1) => ({ id, a, b, lengthIn, attrs: { ...at, story } });
const ds = { shape: "rect", size: "2x3", dsStyle: "plain", material: "aluminum", gauge: ".027", finish: "painted", color: "white", bottom: { kind: "none" }, heightIn: 120 } as const;

export const REF = {
  runs: [run("a", p0, p1, ft(44, 6)), run("b", p1, p2, ft(28, 10)), run("c", p2, p3, ft(44, 2)), run("d", p3, p4, ft(29, 1)), run("e", q0, q1, ft(49, 7)), run("f", q1, q2, ft(55, 2))],
  downspouts: [
    { id: "d1", runId: "a", atIn: 24, ...ds, elbows: [{ style: "A", qty: 2 }, { style: "B", qty: 1 }] },
    { id: "d2", runId: "d", atIn: ft(29, 1) - 24, ...ds, elbows: [{ style: "B", qty: 2 }], offsets: [{ lengthIn: 4, qty: 1 }] },
    { id: "d3", runId: "f", atIn: ft(55, 2) - 24, ...ds, elbows: [{ style: "A", qty: 1 }, { style: "B", qty: 3 }], offsets: [{ lengthIn: 2, qty: 1 }] },
  ],
} as unknown as Drawing;

/** a closed outline, a second storey with a 2'-6" stub, downspouts with nothing measured, a long company name */
export const HARD = {
  runs: [run("a", [0, 0], [480, 0], 480), run("b", [480, 0], [480, 336], 336), run("c", [480, 336], [0, 336], 480), run("d", [0, 336], [0, 0], 336),
    run("e", [100, 120], [100, 220], 100, 2), run("f", [100, 220], [300, 220], 195.5, 2), run("g", [300, 220], [300, 190], 30, 2)],
  downspouts: [{ id: "1", runId: "a", atIn: 12, ...ds, elbows: [{ style: "A", qty: 2 }] }, { id: "2", runId: "b", atIn: 300, ...ds, heightIn: undefined }, { id: "3", runId: "c", atIn: 240, ...ds, elbows: [], offsets: [] }, { id: "4", runId: "f", atIn: 30, ...ds }],
} as unknown as Drawing;

export function ctxOf(d: Drawing, lang: "en" | "ru" | "es" = "en", job: Partial<ShopCtx["job"]> = {}): ShopCtx {
  const r = readRules({});
  return {
    t: tFor(lang),
    job: { company: { name: "Urbantech Builders", lines: ["Woodland Hills, CA", "CSLB Lic. #1115986"] }, date: "11/12/2026", ...job },
    rules: { hangerSpacingIn: r.hangerSpacingIn, hangerExtra: r.hangerExtra, wasteFt: r.wasteFt, dsStickFt: r.dsStickFt, storyFt: r.storyFt, corner: r.corner },
    parts: computeGutterParts(toMeasurement(d, { method: r.corner }), toRulesOverride({})).parts,
    fmt: "ftin",
  };
}
