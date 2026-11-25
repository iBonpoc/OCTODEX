/** v43 PR C: the fitting rows of the downspout window — «Elbow A · 75° ⌄ · − n +», «Offset B · 2″ ⌄ · − n +» (pure helpers) */
import { describe, expect, it } from "vitest";
import { offsetRow, offsetsPatch, rectElbowAngle, rectElbowPatch, roundElbow, roundElbowPatch } from "../src/modules/gutters/canvas/fittingRows";

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
