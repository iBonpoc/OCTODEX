import { describe, expect, it } from "vitest";
import { icons } from "@octo/design-tokens";

/** #929 PR-1: four downspout-kind icons of our own in «Наряд» (the picker of the kind comes in PR-2). */
const KINDS = ["dsRect", "dsRectRibbed", "dsRound", "dsRoundRibbed"] as const;
describe("downspout kind icons", () => {
  it("all four exist, are drawn (a path), and differ from each other and from the old «downspout» mark", () => {
    const paths = KINDS.map((k) => icons[k]);
    for (const p of paths) expect(p).toMatch(/^M[\d .\-a-zA-Z]+$/);
    expect(new Set([...paths, icons.downspout]).size).toBe(5);
  });
  // #2350 «Тонкие острые» (founder 20.11.2026: «даунспауты оставляем»): a ribbed kind is drawn by its own corrugated outline
  // (the notches of a rectangular one, the waves of a round one) — more drawing than its smooth one, never the same
  it("a ribbed kind is its own corrugated outline, more drawn than its smooth one", () => {
    expect(icons.dsRectRibbed).not.toBe(icons.dsRect);
    expect(icons.dsRoundRibbed).not.toBe(icons.dsRound);
    expect(icons.dsRectRibbed.length).toBeGreaterThan(icons.dsRect.length / 2);
    expect(icons.dsRoundRibbed.length).toBeGreaterThan(icons.dsRound.length);
  });
  it("neutral names (no niche word in the core's icon set)", () => {
    for (const k of KINDS) expect(k).not.toMatch(/gutter|желоб/i);
  });
});
