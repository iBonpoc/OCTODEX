/**
 * What the downspout window says under «Вид · Размер · Этаж» (v43 PR D): «Длина 10 ft · 1 эт.», «Длина 20 ft — 2 шт. по 10 ft». The
 * length the estimate takes (engine `downspoutLengthIn`: the downspout's own storey, else its gutter's; onto a lower roof — a storey
 * less; «Своя высота» wins). Pure — unit-tested (test/gutterDsStory.test.ts).
 */
import { DEFAULT_GUTTER_RULES, dsStoryOf, resolveGutterRules, type GutterRulesOverride } from "@octo/estimating-engine";
import type { DsAttrs } from "./attrs";

export type DsLengthLine = { own: boolean; ft: number; stories: number };

/**
 * The HEIGHT the window says: by the storeys (or «Своя высота»), by the company's rules. It is not the length the estimate buys: the
 * estimate adds the extension and the bends made on site and rounds up to sticks (`gutterParts.ts` `fieldBendOf`, `dsRoundedIn`), so the
 * window does not tell sticks (K2 #2662 — it said «2 шт.» where the estimate bought 3).
 */
export function dsLengthLine(ds: Pick<DsAttrs, "story" | "heightIn" | "bottom">, runStory: number, over?: GutterRulesOverride): DsLengthLine {
  const rules = over ? resolveGutterRules(over) : DEFAULT_GUTTER_RULES;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (ds.heightIn !== undefined) return { own: true, ft: r1(ds.heightIn / 12), stories: 0 };
  const story = dsStoryOf(ds, runStory);
  const stories = ds.bottom.kind === "lower_roof" ? Math.max(story - 1, 0) : story;
  return { own: false, ft: r1((stories * rules.storyHeightIn) / 12), stories };
}
