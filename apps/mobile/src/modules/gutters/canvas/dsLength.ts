/**
 * What the downspout window says under «Вид · Размер · Этаж» (v43 PR D): «Длина 10 ft · 1 эт.», «Длина 20 ft — 2 шт. по 10 ft». The
 * length the estimate takes (engine `downspoutLengthIn`: the downspout's own storey, else its gutter's; onto a lower roof — a storey
 * less; «Своя высота» wins). Pure — unit-tested (test/gutterDsStory.test.ts).
 */
import { DEFAULT_GUTTER_RULES, dsStoryOf } from "@octo/estimating-engine";
import type { DsAttrs } from "./attrs";

export type DsLengthLine = { own: boolean; ft: number; stories: number; stickFt: number };

export function dsLengthLine(ds: Pick<DsAttrs, "story" | "heightIn" | "bottom">, runStory: number, rules = DEFAULT_GUTTER_RULES): DsLengthLine {
  const stickFt = rules.storyHeightIn / 12;
  if (ds.heightIn !== undefined) return { own: true, ft: Math.round((ds.heightIn / 12) * 10) / 10, stories: 0, stickFt };
  const story = dsStoryOf(ds, runStory);
  const stories = ds.bottom.kind === "lower_roof" ? Math.max(story - 1, 0) : story;
  return { own: false, ft: stories * stickFt, stories, stickFt };
}
