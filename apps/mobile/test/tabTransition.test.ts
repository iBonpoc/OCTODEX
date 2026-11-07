/** Founder 07.11: a section of the bottom bar changes with a short fade (motion.durFast), reduced motion — none. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { tabTransition } from "../src/nav/tabTransition";

describe("tab change", () => {
  it("fades for motion.durFast", () => {
    expect(tabTransition(false)).toEqual({ animation: "fade", transitionSpec: { animation: "timing", config: { duration: motion.durFast } } });
  });
  it("reduced motion: no animation", () => {
    expect(tabTransition(true)).toEqual({ animation: "none" });
  });
  it("the tabs navigator uses it with the reduced-motion setting", () => {
    const src = readFileSync(join(__dirname, "../src/app/(tabs)/_layout.tsx"), "utf8");
    expect(src).toMatch(/useReducedMotion\(\)/);
    expect(src).toMatch(/\.\.\.tabTransition\(reduce\)/);
  });
});
