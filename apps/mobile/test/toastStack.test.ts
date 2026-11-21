import { describe, expect, it } from "vitest";
import { motion } from "@octo/design-tokens";
import { stackDrop, stackLife, stackReplace, stackShow, stackTop } from "../src/ui/toastStack";

const t = (id: number, at = id, text = `t${id}`) => ({ id, at, text });

describe("toast stack (DS Б8, #2213/#2214) — up to three, the newest on top", () => {
  it("a new toast goes on top, the older ones stay with their own «Вернуть»", () => {
    const s = stackShow(stackShow([], t(1)), t(2));
    expect(s.map((x) => x.id)).toEqual([2, 1]);
    expect(stackTop(s)?.id).toBe(2);
  });
  it("never more than motion.toastStack (3): a fourth pushes the oldest out", () => {
    let s: ReturnType<typeof t>[] = [];
    for (const i of [1, 2, 3, 4]) s = stackShow(s, t(i));
    expect(motion.toastStack).toBe(3);
    expect(s.map((x) => x.id)).toEqual([4, 3, 2]);
  });
  it("grow: the top toast takes the new text in place, keeps its id; a grow of a toast that is not on top is a new toast", () => {
    const s = stackShow([t(1), t(0)], { id: 5, at: 5, text: "Удалено позиций: 2" }, 1);
    expect(s).toEqual([{ id: 1, at: 5, text: "Удалено позиций: 2" }, t(0)]);
    const s2 = stackShow([t(2), t(1)], t(6), 1);
    expect(s2.map((x) => x.id)).toEqual([6, 2, 1]);
  });
  it("replace: the same toast in its place (a «Вернуть» too late says so), the others untouched", () => {
    const s = stackReplace([t(3), t(2), t(1)], 2, { id: 9, at: 9, text: "late" });
    expect(s.map((x) => [x.id, x.text])).toEqual([[3, "t3"], [2, "late"], [1, "t1"]]);
  });
  it("drop: the toast leaves; an older timer of a grown toast (another `at`) does not take it", () => {
    expect(stackDrop([t(3), t(2)], 2).map((x) => x.id)).toEqual([3]);
    expect(stackDrop([{ id: 2, at: 7, text: "" }], 2, 2)).toHaveLength(1);
    expect(stackDrop([{ id: 2, at: 7, text: "" }], 2, 7)).toHaveLength(0);
  });
  it("each lives ≥ 5 s; with a screen reader a toast with «Вернуть» has no clock, a plain one the longer time", () => {
    expect(stackLife(true, false)).toBe(motion.toastUndoMs);
    expect(stackLife(false, false)).toBe(motion.toastUndoMs);
    expect(motion.toastUndoMs).toBeGreaterThanOrEqual(5000);
    expect(stackLife(true, true)).toBeNull();
    expect(stackLife(false, true)).toBe(motion.toastUndoA11yMs);
  });
});
