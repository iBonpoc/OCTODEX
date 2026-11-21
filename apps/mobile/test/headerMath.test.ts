import { describe, expect, it } from "vitest";
import { component, motion } from "@octo/design-tokens";
import { foldEnd, foldHalf, foldStage, headerFrame, ramp, settleTarget, type HeaderKind } from "../src/ui/templates/headerMath";

/** visual-v2 «Сворачивающаяся шапка» (rule 27а: the motion's math, the phone is not a browser) */
const H = component.header;
const ys = (to: number) => Array.from({ length: to * 2 + 1 }, (_, i) => i / 2);
const keys = ["kick", "title", "titleScale", "sub", "actions", "actionsY", "mini", "miniY", "plate", "plus", "demoDot", "avatarScale"] as const;

describe("the header's scroll points (v2 numbers)", () => {
  it("root folds at 64, object at 112, the editor never; the half is 32 / 56", () => {
    expect([foldEnd("root"), foldEnd("object"), foldEnd("editor")]).toEqual([64, 112, 0]);
    expect([foldHalf("root"), foldHalf("object")]).toEqual([32, 56]);
    expect(H.row + H.big).toBe(112);
    expect(H.bar).toBe(52);
  });
  it("ramp: clamped 0 … 1, a step when the ends meet", () => {
    expect([ramp(-5, 0, 24), ramp(0, 0, 24), ramp(12, 0, 24), ramp(24, 0, 24), ramp(99, 0, 24)]).toEqual([0, 0, 0.5, 1, 1]);
    expect([ramp(9, 10, 10), ramp(10, 10, 10)]).toEqual([0, 1]);
  });
});

describe("root of a tab (0–64)", () => {
  it("open at 0 and above (a bounce is the open header)", () => {
    for (const y of [0, -30]) {
      const f = headerFrame("root", y);
      expect([f.kick, f.title, f.titleScale, f.mini, f.plate, f.demoDot, f.avatarScale]).toEqual([1, 1, 1, 0, 0, 0, 1]);
    }
  });
  it("the date line is gone by 24, the title only starts to shrink at 16 and fade at 40", () => {
    expect(headerFrame("root", 24).kick).toBe(0);
    expect(headerFrame("root", 12).kick).toBeCloseTo(0.5);
    expect(headerFrame("root", 16).titleScale).toBe(1);
    expect(headerFrame("root", 40).title).toBe(1);
    expect(headerFrame("root", 52).title).toBeCloseTo(0.5);
  });
  it("the small title comes in 40–64 and slides 8 → 0; the plate 48–64", () => {
    expect(headerFrame("root", 40).mini).toBe(0);
    expect(headerFrame("root", 40).miniY).toBe(8);
    expect(headerFrame("root", 52).mini).toBeCloseTo(0.5);
    expect(headerFrame("root", 47).plate).toBe(0);
    expect(headerFrame("root", 56).plate).toBeCloseTo(0.5);
  });
  it("folded from 64: the title 30 → 17 (0.57), gone; the row has its plate; the avatar 36; the «Демо» dot on it", () => {
    for (const y of [64, 200]) {
      const f = headerFrame("root", y);
      expect(f.titleScale).toBeCloseTo(H.foldScale);
      expect(Math.round(30 * f.titleScale)).toBe(17);
      expect([f.title, f.mini, f.miniY, f.plate, f.demoDot]).toEqual([0, 1, 0, 1, 1]);
      expect(f.avatarScale).toBeCloseTo(0.9);
      expect(f.plus).toBe(1);
    }
  });
});

describe("object (0–112)", () => {
  it("quick actions fade 0–48 and go up 12", () => {
    expect(headerFrame("object", 0).actions).toBe(1);
    expect(headerFrame("object", 24).actions).toBeCloseTo(0.5);
    expect(headerFrame("object", 48).actions).toBe(0);
    expect(headerFrame("object", 48).actionsY).toBe(-12);
  });
  it("the two lines fade 32–72, the parent's word 56–80, the name shrinks 56–112", () => {
    expect(headerFrame("object", 32).sub).toBe(1);
    expect(headerFrame("object", 52).sub).toBeCloseTo(0.5);
    expect(headerFrame("object", 72).sub).toBe(0);
    expect(headerFrame("object", 56).kick).toBe(1);
    expect(headerFrame("object", 68).kick).toBeCloseTo(0.5);
    expect(headerFrame("object", 80).kick).toBe(0);
    expect(headerFrame("object", 56).titleScale).toBe(1);
    expect(headerFrame("object", 84).titleScale).toBeCloseTo((1 + H.foldScale) / 2);
  });
  it("folded from 112: «← Имя ⌄ ⋯» — the small name in, «＋» gone into «⋯», the plate on, the «Демо» dot at «←»", () => {
    const f = headerFrame("object", 112);
    expect([f.title, f.mini, f.plate, f.plus, f.demoDot, f.sub, f.actions]).toEqual([0, 1, 1, 0, 1, 0, 0]);
    expect(headerFrame("object", 100).plus).toBeGreaterThan(0);
  });
});

describe("monotone: the header only folds as the page goes down", () => {
  const down = ["mini", "plate", "demoDot"] as const;
  const up = ["kick", "title", "titleScale", "sub", "actions", "plus", "avatarScale"] as const;
  for (const kind of ["root", "object"] as HeaderKind[]) {
    it(`${kind}: no part turns back, every value stays in its range`, () => {
      let prev = headerFrame(kind, 0);
      for (const y of ys(foldEnd(kind) + 20)) {
        const f = headerFrame(kind, y);
        for (const k of down) expect(f[k], `${k} @${y}`).toBeGreaterThanOrEqual(prev[k] - 1e-9);
        for (const k of up) expect(f[k], `${k} @${y}`).toBeLessThanOrEqual(prev[k] + 1e-9);
        expect(f.miniY).toBeLessThanOrEqual(prev.miniY + 1e-9);
        expect(f.actionsY).toBeLessThanOrEqual(prev.actionsY + 1e-9);
        for (const k of ["kick", "title", "sub", "actions", "mini", "plate", "plus", "demoDot"] as const) {
          expect(f[k]).toBeGreaterThanOrEqual(0);
          expect(f[k]).toBeLessThanOrEqual(1);
        }
        prev = f;
      }
    });
    it(`${kind}: no jump — one half-point of scroll moves nothing by more than a little`, () => {
      for (const y of ys(foldEnd(kind))) {
        const a = headerFrame(kind, y);
        const b = headerFrame(kind, y + 0.5);
        // a part's opacity / scale by less than 7 %, its slide by less than half a point
        for (const k of keys) expect(Math.abs(b[k] - a[k]), `${k} @${y}`).toBeLessThan(k === "miniY" || k === "actionsY" ? 0.5 : 0.07);
      }
    });
  }
});

describe("let go between the ends: the nearer one", () => {
  it("root: before 32 opens, from 32 folds; at an end or past the header nothing moves", () => {
    expect(settleTarget("root", 10)).toBe(0);
    expect(settleTarget("root", 31.9)).toBe(0);
    expect(settleTarget("root", 32)).toBe(64);
    expect(settleTarget("root", 60)).toBe(64);
    for (const y of [0, -12, 64, 300]) expect(settleTarget("root", y)).toBeNull();
  });
  it("object: the half is 56", () => {
    expect(settleTarget("object", 55)).toBe(0);
    expect(settleTarget("object", 56)).toBe(112);
    expect(settleTarget("object", 111)).toBe(112);
    expect(settleTarget("object", 112)).toBeNull();
  });
  it("a fling down folds at once, a fling up opens; a slow finger does not count", () => {
    expect(settleTarget("object", 8, H.flick)).toBe(112);
    expect(settleTarget("object", 100, -H.flick)).toBe(0);
    expect(settleTarget("root", 40, H.slow)).toBe(64);
    expect(settleTarget("root", 20, -H.slow)).toBe(0);
  });
  it("the editor never settles (one line, never folds)", () => {
    for (const y of [0, 10, 40, 200]) expect(settleTarget("editor", y, 2)).toBeNull();
    expect(foldStage("editor", 500)).toBe(0);
  });
  it("the settle runs `durBase` 220 with the easeOut [0.2, 0.8, 0.2, 1] — no ease-in", () => {
    expect(motion.durBase).toBe(220);
    expect([...motion.easeOut]).toEqual([0.2, 0.8, 0.2, 1]);
  });
  it("the stage the row's controls follow: 0 open, 1 past the half, 2 folded", () => {
    expect([foldStage("root", 0), foldStage("root", 31), foldStage("root", 32), foldStage("root", 64)]).toEqual([0, 0, 1, 2]);
    expect([foldStage("object", 55), foldStage("object", 56), foldStage("object", 112)]).toEqual([0, 1, 2]);
  });
});

describe("Reduce Motion: a fade at the half, nothing moves or scales", () => {
  for (const kind of ["root", "object"] as HeaderKind[]) {
    it(kind, () => {
      const half = foldHalf(kind);
      for (const y of ys(foldEnd(kind) + 10)) {
        const f = headerFrame(kind, y, true);
        expect([f.titleScale, f.avatarScale, f.actionsY, f.miniY]).toEqual([1, 1, 0, 0]);
        const past = y >= half;
        expect(f.title).toBe(past ? 0 : 1);
        expect(f.mini).toBe(past ? 1 : 0);
        expect(f.kick).toBe(f.title);
      }
      expect(motion.durFast).toBe(160);
    });
  }
  it("the editor: the plate only says the page went under it", () => {
    expect(headerFrame("editor", 0, true).plate).toBe(0);
    expect(headerFrame("editor", 4, true).plate).toBe(1);
    expect(headerFrame("editor", 400).mini).toBe(1);
  });
});

describe("Reduce Motion's fade mixes only opacities", () => {
  it("halfway through the 160 ms fade: the opacities at half, no scale, no slide", async () => {
    const { reducedFrame } = await import("../src/ui/templates/headerMath");
    for (const kind of ["root", "object"] as HeaderKind[]) {
      const f = reducedFrame(kind, 0.5);
      expect([f.titleScale, f.avatarScale, f.actionsY, f.miniY]).toEqual([1, 1, 0, 0]);
      expect([f.title, f.mini, f.plate]).toEqual([0.5, 0.5, 0.5]);
      expect(reducedFrame(kind, 0)).toEqual(headerFrame(kind, 0, true));
      expect(reducedFrame(kind, 1)).toEqual(headerFrame(kind, foldEnd(kind), true));
      expect(reducedFrame(kind, 7).title).toBe(0);
    }
  });
});

describe("the sticky strip stands right under the pinned row", () => {
  it("no shift until it meets the row, then it follows the page down to the row's height, then stays", async () => {
    const { stickShift } = await import("../src/ui/templates/headerMath");
    const top = 400;
    const off = 44 + H.bar;
    expect(stickShift(0, top, off)).toBe(0);
    expect(stickShift(top - off, top, off)).toBe(0);
    expect(stickShift(top - off + 10, top, off)).toBe(10);
    expect(stickShift(top, top, off)).toBe(off);
    expect(stickShift(top + 500, top, off)).toBe(off);
    // where it shows on the screen: the page moved it up by y, the scroll's sticking holds it at 0 from `top` — on screen it never
    // goes above the row's bottom (off) once it met it, and it never jumps
    const onScreen = (y: number) => (y < top ? top - y : 0) + stickShift(y, top, off);
    for (let y = top - off; y <= top + 300; y += 0.5) expect(onScreen(y)).toBeCloseTo(off);
  });
  it("not measured yet, or no row (820/1280 with the address bar): nothing moves", async () => {
    const { stickShift } = await import("../src/ui/templates/headerMath");
    expect(stickShift(300, 0, 96)).toBe(0);
    expect(stickShift(300, 400, 0)).toBe(0);
  });
});
