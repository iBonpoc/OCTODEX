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
    const body = src.slice(src.indexOf("const nextStory = "), src.indexOf("\n", src.indexOf("const nextStory = ")));
    expect(body).toContain("setStoryN(nextStoryOf(story))");
    expect(body).not.toMatch(/commit|setStory\(|selected/);
    expect(src).not.toMatch(/\bsetStory\b(?!N)/);
  });
});
