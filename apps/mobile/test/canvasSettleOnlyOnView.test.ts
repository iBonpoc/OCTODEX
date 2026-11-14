/**
 * #1403 (founder 14.11, iPhone: «прыгает то больше, то меньше»): the canvas drops its live transform (settleView) only when the VIEW is a new one.
 * `gestures` is a new object on every render of the drawing screen; an effect that listed it ran on every render — a blink, a save, a turn of the
 * phone — and took the pinch away in the middle of it. The behaviour is e2e 381 (a render in the middle of a pinch); this is the source guard,
 * so the dependency list cannot grow back without a red test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "src", "modules", "gutters", "canvas", "CanvasView.tsx"), "utf8");

describe("CanvasView: the live transform is dropped on a new view only", () => {
  it("the effect that settles the view lists the view alone (not the gestures object, which is new on every render)", () => {
    const effects = [...src.matchAll(/useLayoutEffect\(\(\) => \{([^}]*)\}, \[([^\]]*)\]\)/g)].filter((m) => /settle/.test(m[1]!));
    expect(effects.length).toBe(1);
    expect(effects[0]![2]!.trim()).toBe("view");
  });
  it("it calls the settle through a ref that is kept up to date, so the effect never reads a stale closure", () => {
    expect(src).toMatch(/const settle = useRef\(gestures\.settleView\);\s*settle\.current = gestures\.settleView;/);
    expect(src).toMatch(/settle\.current\(view\)/);
    expect(src).not.toMatch(/gestures\.settleView\(view\)/);
  });
});
