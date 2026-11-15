import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextStoryOf } from "../src/modules/gutters/canvas/scene";

// #1608 (founder 15.11, README §12 п.19): «Эт» only switches the story of the next gutter; the picked one stays where it is
describe("the story button (#1608)", () => {
  it("goes 1 → 2 → 3 → 4 → 1", () => {
    expect([1, 2, 3, 4].map((s) => nextStoryOf(s as 1 | 2 | 3 | 4))).toEqual([2, 3, 4, 1]);
  });
  it("does not move the picked gutter to another story", () => {
    const src = readFileSync(join(__dirname, "../src/modules/gutters/draw/DrawScreen.tsx"), "utf8");
    const body = /const nextStory = ([^;]*);/.exec(src)?.[1] ?? "";
    expect(body).toContain("setStoryN(nextStoryOf(story))");
    expect(body).not.toMatch(/commit|setStory\(|selected|drawing/);
    // the button's cell calls that handler and nothing else
    expect(src).toMatch(/testID="draw-story"[^\n]*onPress=\{nextStory\}/);
    // the move of a gutter to another story is not imported by the screen any more: only its properties change the story
    expect(src).not.toMatch(/\bsetStory\b(?!N)/);
  });
});
