/**
 * What the downspout window says under «Вид · Размер · Этаж» (v43 PR D): «Длина 10 ft · 1 эт.», «Длина 20 ft — 2 шт. по 10 ft». The
 * length the estimate takes (engine `downspoutLengthIn`: the downspout's own storey, else its gutter's; onto a lower roof — a storey
 * less; «Своя высота» wins). Pure — unit-tested (test/gutterDsStory.test.ts).
 */
import { DEFAULT_GUTTER_RULES, dsStoryOf, resolveGutterRules, type GutterRulesOverride } from "@octo/estimating-engine";
import type { DsAttrs } from "./attrs";

export type DsLengthLine = { own: boolean; ft: number; stories: number; /** sticks the length takes by the company's stick length (`dsStickIn`) */ pieces: number; stickFt: number };

/** the company's rules (settings → `toRulesOverride`), else the defaults: the window says the length the estimate counts */
export function dsLengthLine(ds: Pick<DsAttrs, "story" | "heightIn" | "bottom">, runStory: number, over?: GutterRulesOverride): DsLengthLine {
  const rules = over ? resolveGutterRules(over) : DEFAULT_GUTTER_RULES;
  const stickFt = rules.dsStickIn / 12;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (ds.heightIn !== undefined) return { own: true, ft: r1(ds.heightIn / 12), stories: 0, pieces: Math.ceil(ds.heightIn / rules.dsStickIn), stickFt };
  const story = dsStoryOf(ds, runStory);
  const stories = ds.bottom.kind === "lower_roof" ? Math.max(story - 1, 0) : story;
  const inches = stories * rules.storyHeightIn;
  return { own: false, ft: r1(inches / 12), stories, pieces: Math.ceil(inches / rules.dsStickIn), stickFt: r1(stickFt) };
}
