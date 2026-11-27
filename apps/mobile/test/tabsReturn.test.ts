/**
 * The page goes back up to the sticky chips strip only when the chip CHANGES (#2737): `Screen`'s effect hangs on `tabKey`, not on the
 * `tabs` element — a new object on every render, so every re-render of a list (↓/↑ of the 1280 panel) scrolled the page back up and,
 * under load, cut the row's `scrollIntoView` short (e2e 158 @1280 light).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "../src/ui/surfaces.tsx"), "utf8");

describe("Screen: back to the chips strip", () => {
  it("the effect that scrolls back to the strip depends on the chip, not on the strip's element", () => {
    // #3060: the tab change jumps to the strip (animated: false), not a glide — the second tap never lands mid-way
    const at = src.indexOf("tabsY.current - stickOff), animated: false");
    expect(at).toBeGreaterThan(0);
    const deps = src.slice(at, src.indexOf("]);", at) + 3);
    expect(deps).toMatch(/\}, \[tabKey, !!tabs\]\);$/);
  });
});
