/** #3004: the one-line fit's measuring layer is 10000 wide; its box must clip it, or a 390 page scrolls sideways (e2e 08-layouts) */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("a fit-to-line text clips its 10000 measuring layer (#3004)", () => {
  for (const [file, fn] of [["ui/mainStep.tsx", "FitText"], ["ui/templates/screenHeader.tsx", "FitTitle"]] as const) {
    it(`${fn} (${file})`, () => {
      const s = src(file);
      const body = s.slice(s.indexOf(`function ${fn}(`));
      const box = body.slice(body.indexOf("return ("), body.indexOf("10000"));
      // the outer box (the one with onLayout → setRoom) clips, or the header's window around it does
      const clipped = /setRoom[^\n]*overflow: "hidden"/.test(box) || (fn === "FitTitle" && /testID="screen-head-big"[^\n]*overflow: "hidden"/.test(s));
      expect(clipped).toBe(true);
    });
  }
});
