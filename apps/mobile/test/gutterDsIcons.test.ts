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
  it("a ribbed kind is its smooth one plus ribs (the same outline first)", () => {
    expect(icons.dsRectRibbed.startsWith(icons.dsRect)).toBe(true);
    expect(icons.dsRoundRibbed.startsWith(icons.dsRound)).toBe(true);
  });
  it("neutral names (no niche word in the core's icon set)", () => {
    for (const k of KINDS) expect(k).not.toMatch(/gutter|желоб/i);
  });
});
