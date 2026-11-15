import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manyStories, nextStoryOf } from "../src/modules/gutters/canvas/scene";

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

describe("manyStories — «эт N» only with more than one storey (#1275 the canvas, #1666 the summary of the picked thing)", () => {
  const run = (story?: unknown) => ({ attrs: { story } });
  it("none or one storey — false (no word: it tells nothing)", () => {
    expect(manyStories([])).toBe(false);
    expect(manyStories([run(1), run(undefined), run(1)])).toBe(false);
    expect(manyStories([run(3), run(3)])).toBe(false);
  });
  it("two storeys — true; a broken storey counts as 1, 5+ as 4", () => {
    expect(manyStories([run(1), run(2)])).toBe(true);
    expect(manyStories([run("x"), run(1)])).toBe(false);
    expect(manyStories([run(4), run(7)])).toBe(false);
  });
});
