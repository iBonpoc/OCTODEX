/** #3082 (rule 27): the math of paging the photo viewer — the nearest page, the ends, a width change, the first frame. */
import { describe, expect, it } from "vitest";
import { needsPut, offsetOf, pageOf, stepPage } from "../src/features/photoPager";

describe("pageOf", () => {
  it("the nearest page: past the half — the next, short of it — stays", () => {
    expect(pageOf(0, 390, 5)).toBe(0);
    expect(pageOf(194, 390, 5)).toBe(0);
    expect(pageOf(196, 390, 5)).toBe(1);
    expect(pageOf(780, 390, 5)).toBe(2);
  });
  it("never outside the strip (a bounce past an end)", () => {
    expect(pageOf(-60, 390, 5)).toBe(0);
    expect(pageOf(390 * 7, 390, 5)).toBe(4);
  });
  it("no width yet (the first frame) or a broken offset: the page asked for, inside the strip", () => {
    expect(pageOf(500, 0, 5, 3)).toBe(3);
    expect(pageOf(Number.NaN, 390, 5, 9)).toBe(4);
    expect(pageOf(0, 390, 0)).toBe(0);
  });
});

describe("offsetOf / a width change keeps the photo", () => {
  it("the page's start; the same page after a rotation", () => {
    expect(offsetOf(2, 390)).toBe(780);
    const page = pageOf(offsetOf(3, 390), 390, 5);
    expect(pageOf(offsetOf(page, 844), 844, 5)).toBe(3);
  });
});

describe("stepPage", () => {
  it("steps and stops at the ends, no wrap", () => {
    expect(stepPage(0, -1, 3)).toBe(0);
    expect(stepPage(0, 1, 3)).toBe(1);
    expect(stepPage(2, 1, 3)).toBe(2);
    expect(stepPage(0, 1, 0)).toBe(0);
  });
});

describe("needsPut — no fight with the finger", () => {
  it("a page the swipe reached (already in view, same width): no scroll", () => {
    expect(needsPut(1, 1, 390, 390)).toBe(false);
  });
  it("a page asked for from outside, the first frame, a rotation: scroll there", () => {
    expect(needsPut(2, 1, 390, 390)).toBe(true);
    expect(needsPut(0, -1, 390, 0)).toBe(true);
    expect(needsPut(1, 1, 844, 390)).toBe(true);
  });
});
