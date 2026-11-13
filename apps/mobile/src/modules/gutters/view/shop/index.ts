/**
 * The shop drawings of a measurement (#1349, founder 13.11: «как из AutoCAD»): a layout plan per storey (G-1 …), the
 * schedules and materials (the next G sheets), and the supplier's «MATERIAL ORDER». Drawn at ANSI B (11 × 17) and
 * printed so, or reduced whole to Letter — nothing is laid out again, so no text is below 11 pt on the sheet (7 pt on
 * Letter). `problems` is the check made before saving: every overlap, everything outside the border, a text too small.
 */
import { shopSheet as SS } from "@octo/design-tokens";
import type { Drawing } from "../../geometry";
import { sw, type ShopCtx, type Tr } from "./job";
import { shopModel } from "./model";
import { planSheet } from "./plan";
import { orderSheets, schedulesSheets } from "./schedules";
import { sheetsHtml, type Sheet } from "./sheet";

export { shopJob } from "./job";
export type { ShopCtx, ShopJob, ShopRules } from "./job";
export type ShopPaper = "ansiB" | "letter";

export interface ShopSet { drawings: Sheet[]; order: Sheet[]; problems: string[] }

export function shopSheets(d: Drawing, x: ShopCtx): ShopSet {
  const m = shopModel(d, x.rules.storyFt);
  const plans = m.stories.length;
  // the schedules may take more than one sheet: counted first, then drawn with «SHEET n OF N»
  const build = (of: number) => {
    const sched = schedulesSheets(x, m, plans + 1, of);
    return [...m.stories.map((st, i) => planSheet(x, m, st, { sheet: `G-${i + 1}`, n: i + 1, of, schedules: `G-${plans + 1}` })), ...sched];
  };
  const drawings = build(build(plans + 1).length);
  const order = orderSheets(x, m);
  const name = (i: number) => (i < drawings.length ? `G-${i + 1}` : `MO-${i - drawings.length + 1}`);
  const problems = [...drawings, ...order].flatMap((s, i) => [...s.notes, ...s.problems(), ...(s.minPt() < SS.minPt - 0.01 ? [`a text of ${s.minPt().toFixed(1)} pt`] : [])].map((p) => `${name(i)}: ${p}`));
  return { drawings, order, problems };
}

/** the page to print: the sheets at their own size, or the whole sheet reduced to Letter */
export function shopHtml(sheets: Sheet[], title: string, paper: ShopPaper = "ansiB"): string {
  return sheetsHtml(sheets, title, paper === "letter" ? { w: SS.letterWIn, h: SS.letterHIn } : undefined);
}
/** a page's size in points, for the phone's printer */
export const shopPagePt = (sheets: Sheet[], paper: ShopPaper = "ansiB") => (paper === "letter" ? { width: SS.letterWIn * 72, height: SS.letterHIn * 72 } : { width: sheets[0]!.w * 72, height: sheets[0]!.h * 72 });

export const shopFileName = (t: Tr, kind: "drawings" | "order", who?: string) =>
  [sw(t, kind === "order" ? "fileOrder" : "fileDrawings"), who].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "").trim();
