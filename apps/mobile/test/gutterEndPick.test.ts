/**
 * #1855 (founder 16.11: «выбираю End Cap и нажимаю удалить — удаляется весь желоб… надо нажимать на end cap и удалять её одну»):
 * 🗑 with a cap picked takes the cap off, the gutter stays; with the gutter picked (its body) — the gutter.
 */
import { describe, expect, it } from "vitest";
import { deleteTarget, hasCap } from "../src/modules/gutters/canvas/endPick";
import { setCapOff } from "../src/modules/gutters/canvas/edit";

const run = (id: string, a: [number, number], b: [number, number], noCap?: [boolean, boolean]) => ({ id, a, b, attrs: { story: 1 } as never, ...(noCap ? { noCap } : {}) });
const one = { runs: [run("r", [0, 0], [240, 0])], downspouts: [] } as never;
const corner = { runs: [run("r", [0, 0], [240, 0]), run("s", [240, 0], [240, 120])], downspouts: [] } as never;

describe("a cap picked on its own (#1855)", () => {
  it("a free end has a cap; set «без заглушки» — none; an end at a corner — none", () => {
    expect(hasCap(one, "r", 0)).toBe(true);
    expect(hasCap(one, "r", 1)).toBe(true);
    expect(hasCap(setCapOff(one, "r", 1, true), "r", 1)).toBe(false);
    expect(hasCap(corner, "r", 1)).toBe(false);
    expect(hasCap(corner, "r", 0)).toBe(true);
    expect(hasCap(one, "nope", 0)).toBe(false);
  });
  it("🗑: the picked cap — only the cap (red before: the whole gutter went)", () => {
    expect(deleteTarget(one, "r", { id: "r", end: 1 })).toEqual({ kind: "cap", id: "r", end: 1 });
    const after = setCapOff(one, "r", 1, true);
    expect((after as { runs: unknown[] }).runs).toHaveLength(1);
    expect(hasCap(after, "r", 1)).toBe(false);
    expect(hasCap(after, "r", 0)).toBe(true);
  });
  it("🗑: the gutter picked by its body, a cap already off, another thing picked — the element", () => {
    expect(deleteTarget(one, "r", null)).toEqual({ kind: "element", id: "r" });
    expect(deleteTarget(setCapOff(one, "r", 1, true), "r", { id: "r", end: 1 })).toEqual({ kind: "element", id: "r" });
    expect(deleteTarget(one, "d", { id: "r", end: 1 })).toEqual({ kind: "element", id: "d" });
    expect(deleteTarget(one, null, { id: "r", end: 1 })).toBeNull();
  });
});
