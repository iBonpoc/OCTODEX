import { describe, expect, it } from "vitest";
import { gesture, motion } from "@octo/design-tokens";
import { createDragEnd, holdStill, longPressMenu, showsHandle } from "../src/features/estimate/rowGesture";

describe("rowGesture — a folded line of the estimate (visual v2 №5)", () => {
  const base = { canceled: false, ty: 0, fine: false, key: "l:a", open: false };
  it("a finger's hold let go where it was taken opens the menu", () => {
    expect(holdStill(base)).toBe(true);
    expect(holdStill({ ...base, ty: gesture.dragStart - 1 })).toBe(true);
    expect(holdStill({ ...base, ty: -(gesture.dragStart - 1) })).toBe(true);
  });
  it("carried further, canceled, a mouse, a section or an open line — no menu", () => {
    expect(holdStill({ ...base, ty: gesture.dragStart })).toBe(false);
    expect(holdStill({ ...base, ty: -40 })).toBe(false);
    expect(holdStill({ ...base, canceled: true })).toBe(false);
    expect(holdStill({ ...base, fine: true })).toBe(false);
    expect(holdStill({ ...base, key: "s:x" })).toBe(false);
    expect(holdStill({ ...base, open: true })).toBe(false);
  });
  it("the long press opens the menu only for a mouse; a finger's hold is the drag", () => {
    expect(longPressMenu(true)).toBe(true);
    expect(longPressMenu(false)).toBe(false);
  });
  it("«≡» — on sections and the open line only", () => {
    expect(showsHandle("l:a", false)).toBe(false);
    expect(showsHandle("l:a", true)).toBe(true);
    expect(showsHandle("s:x", false)).toBe(true);
    expect(showsHandle("u", false)).toBe(true);
  });
  it("a drop is not a tap: the row's tap right after a drag ended does not open it (#2350, the web's click after a mouse drag)", () => {
    let t = 1000;
    const d = createDragEnd(() => t);
    expect(d.justDragged(motion.durSlow)).toBe(false);
    d.ended();
    t += motion.durSlow - 1;
    expect(d.justDragged(motion.durSlow)).toBe(true);
    t += 1;
    expect(d.justDragged(motion.durSlow)).toBe(false);
  });
});
