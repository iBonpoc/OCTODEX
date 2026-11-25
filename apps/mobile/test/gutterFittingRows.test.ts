/** v43 PR C: the fitting rows of the downspout window — «Elbow A · 75° ⌄ · − n +», «Offset B · 2″ ⌄ · − n +» (pure helpers) */
import { describe, expect, it } from "vitest";
import { offsetRest, offsetRow, offsetsPatch, rectElbowAngle, rectElbowPatch, roundElbow, roundElbowPatch, roundElbowRest } from "../src/modules/gutters/canvas/fittingRows";

const rectReady = { shape: "rect" as const, dsStyle: "corrugated" as const };
const rectPlain = { shape: "rect" as const, dsStyle: "plain" as const };
const round = { shape: "round" as const };

describe("rect elbows: a count and an angle per style", () => {
  it("the angle is 75° until set; 75° is never written, another one is", () => {
    expect(rectElbowAngle({ elbows: [{ style: "A", qty: 2 }] }, "A")).toBe(75);
    const p = rectElbowPatch({ ...rectReady, elbows: [{ style: "A", qty: 2 }] }, "A", 2, 60);
    expect(p.elbows).toEqual([{ style: "A", qty: 2, angle: 60 }]);
    expect(rectElbowPatch({ ...rectReady, ...p }, "A", 2, 75).elbows).toEqual([{ style: "A", qty: 2 }]);
  });
  it("the count of the other style keeps its own angle", () => {
    const a = { ...rectReady, elbows: [{ style: "A", qty: 1, angle: 45 }] };
    expect(rectElbowPatch(a, "B", 1).elbows).toEqual([{ style: "A", qty: 1, angle: 45 }, { style: "B", qty: 1 }]);
  });
  it("a plain one bent on site: the first bought elbow makes it ready-made, all back to 0 — bent on site again", () => {
    expect(rectElbowPatch(rectPlain, "A", 1, 60)).toEqual({ elbows: [{ style: "A", qty: 1, angle: 60 }], elbowBend: "ready" });
    expect(rectElbowPatch({ ...rectPlain, elbows: [{ style: "A", qty: 1 }], elbowBend: "ready" }, "A", 0)).toEqual({ elbows: undefined, elbowBend: undefined });
  });
});

describe("round elbow: one row, the angle is its style", () => {
  it("1 × 75° by default; the angle moves the count; 0 is a style at 0", () => {
    expect(roundElbow(round)).toEqual({ style: "75", qty: 1 });
    expect(roundElbowPatch(round, { style: "45" }).elbows).toEqual([{ style: "45", qty: 1 }]);
    expect(roundElbowPatch({ ...round, elbows: [{ style: "45", qty: 2 }] }, { qty: 0 }).elbows).toEqual([{ style: "45", qty: 0 }]);
    expect(roundElbow({ ...round, elbows: [{ style: "45", qty: 0 }] })).toEqual({ style: "75", qty: 0 });
  });
});

describe("offsets A / B", () => {
  it("a round one has the default 1 × 2″ and one row; a rect one has none", () => {
    expect(offsetRow(round, "A")).toEqual({ lengthIn: 2, qty: 1 });
    expect(offsetRow({ shape: "rect" }, "A")).toEqual({ lengthIn: 2, qty: 0 });
  });
  it("B is written with its style, A without; the other row stays", () => {
    const a = offsetsPatch({ shape: "rect" }, "A", { qty: 1, lengthIn: 4 });
    expect(a.offsets).toEqual([{ lengthIn: 4, qty: 1 }]);
    const b = offsetsPatch({ shape: "rect", ...a }, "B", { qty: 2 });
    expect(b.offsets).toEqual([{ lengthIn: 4, qty: 1 }, { lengthIn: 2, qty: 2, style: "B" }]);
    expect(offsetRow({ shape: "rect", ...b }, "B")).toEqual({ lengthIn: 2, qty: 2 });
  });
  it("all at 0: a rect one — none; a round one keeps a 0 (else its default 1 × 2″ would come back)", () => {
    expect(offsetsPatch({ shape: "rect", offsets: [{ lengthIn: 2, qty: 1 }] }, "A", { qty: 0 }).offsets).toBeUndefined();
    expect(offsetsPatch(round, "A", { qty: 0 }).offsets).toEqual([{ lengthIn: 2, qty: 0 }]);
  });
  it("a round one never gets a style B", () => {
    expect(offsetsPatch(round, "A", { qty: 2, lengthIn: 4 }).offsets).toEqual([{ lengthIn: 4, qty: 2 }]);
  });
});

// К2 #2662, блокер 2 (правило 16): a drawing from the window of before has an entry per angle / per length — the new rows never fold them into one
describe("old data: other entries are never rewritten", () => {
  const round = { shape: "round" as const };
  const rect = { shape: "rect" as const };
  it("round elbows [45 × 1, 90 × 2]: a change of the first row leaves 90 × 2 as it is", () => {
    const a = { ...round, elbows: [{ style: "45", qty: 1 }, { style: "90", qty: 2 }] };
    expect(roundElbowPatch(a, { qty: 3 }).elbows).toEqual([{ style: "45", qty: 3 }, { style: "90", qty: 2 }]);
    expect(roundElbowPatch(a, { style: "60" }).elbows).toEqual([{ style: "60", qty: 1 }, { style: "90", qty: 2 }]);
  });
  it("round elbows: the first row at 0 with others left — its entry goes, theirs stay; the row then shows the next one", () => {
    const a = { ...round, elbows: [{ style: "45", qty: 1 }, { style: "90", qty: 2 }] };
    expect(roundElbowPatch(a, { qty: 0 }).elbows).toEqual([{ style: "90", qty: 2 }]);
    expect(roundElbow(a)).toEqual({ style: "45", qty: 1 });
  });
  it("round elbows: the rest of the list is told to the window (not hidden)", () => {
    expect(roundElbowRest({ ...round, elbows: [{ style: "45", qty: 1 }, { style: "90", qty: 2 }] })).toEqual([{ style: "90", qty: 2 }]);
    expect(roundElbowRest({ ...round, elbows: [{ style: "45", qty: 1 }] })).toEqual([]);
  });
  it("offsets [2″ × 1, 4″ × 1] of one style: «+» of B and a change of A's count keep the 4″ entry", () => {
    const a = { ...rect, offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 4, qty: 1 }] };
    expect(offsetsPatch(a, "B", { qty: 1 }).offsets).toEqual([{ lengthIn: 2, qty: 1 }, { lengthIn: 4, qty: 1 }, { lengthIn: 2, qty: 1, style: "B" }]);
    expect(offsetsPatch(a, "A", { qty: 2 }).offsets).toEqual([{ lengthIn: 2, qty: 2 }, { lengthIn: 4, qty: 1 }]);
    expect(offsetRow(a, "A")).toEqual({ lengthIn: 2, qty: 1 });
    expect(offsetRest(a, "A")).toEqual([{ lengthIn: 4, qty: 1 }]);
  });
});

// К2 #2662, блокер 2: window → attrs → the estimate's parts. An old drawing's parts stay the same after a row is touched.
import { computeGutterParts } from "@octo/estimating-engine";
import { DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import { changeDs } from "../src/modules/gutters/canvas/attrs";
import { toMeasurement, type Drawing, type DrawnDownspout } from "../src/modules/gutters/geometry";

const partsOf = (a: object) => {
  const d: Drawing = { runs: [{ id: "r", a: [0, 0], b: [240, 0], attrs: { profile: "k", size: "5", material: "aluminum", color: "white", story: 1, mount: "fascia", hanger: "hidden" } }], downspouts: [{ ...DEFAULT_DS_ATTRS, ...a, id: "d", runId: "r", atIn: 120 } as DrawnDownspout] };
  return computeGutterParts(toMeasurement(d)).parts.filter((p) => /^(elbow|offset)/.test(p.key)).map((p) => `${p.key}=${p.qty}`).sort();
};
describe("old drawings: the estimate's elbows and offsets are the same after the window touches a row", () => {
  it("round [45 × 1, 90 × 2]: «+» of the first row changes only the first", () => {
    const a = { ...DEFAULT_DS_ATTRS, shape: "round" as const, size: "3", elbows: [{ style: "45", qty: 1 }, { style: "90", qty: 2 }] };
    const before = partsOf(a);
    const after = partsOf(changeDs(a, roundElbowPatch(a, { qty: 2 })));
    const only = (xs: string[], deg: string) => xs.filter((x) => x.includes(`.${deg}.`));
    expect(only(after, "90")).toEqual(only(before, "90")); // the 90° elbows are as they were
    expect(only(before, "90").length).toBeGreaterThan(0);
  });
  it("rect offsets [2″ × 1, 4″ × 1]: a B offset added leaves the A parts as they were", () => {
    const a = { ...DEFAULT_DS_ATTRS, shape: "rect" as const, dsStyle: "corrugated" as const, offsets: [{ lengthIn: 2, qty: 1 }, { lengthIn: 4, qty: 1 }] };
    const before = partsOf(a);
    const after = partsOf(changeDs(a, offsetsPatch(a, "B", { qty: 1 })));
    for (const line of before) expect(after).toContain(line);
  });
});
