import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createLock, createSwipeState } from "../src/features/estimate/swipeState";
import { actOfName, rowActions } from "../src/features/estimateRows";

const closer = () => {
  const c = { n: 0, close: () => void c.n++ };
  return c;
};

describe("row swipes: one open, tap after a swipe, one press (DS Б13, #1286)", () => {
  it("opening a second row closes the first", () => {
    const s = createSwipeState();
    const a = closer();
    const b = closer();
    s.opened(a);
    s.opened(b);
    expect(a.n).toBe(1);
    expect(b.n).toBe(0);
  });
  it("a tap or a scroll closes the open row and says so (then the tap only closes)", () => {
    const s = createSwipeState();
    const a = closer();
    s.opened(a);
    expect(s.closeOpen()).toBe(true);
    expect(a.n).toBe(1);
    expect(s.closeOpen()).toBe(false);
  });
  it("a row that closed by itself is not closed again", () => {
    const s = createSwipeState();
    const a = closer();
    s.opened(a);
    s.closed(a);
    expect(s.closeOpen()).toBe(false);
    expect(a.n).toBe(0);
  });
  it("the tap right after a swipe is ignored for `slow` ms, then it opens the row", () => {
    let t = 1000;
    const s = createSwipeState(() => t);
    expect(s.justSwiped(350)).toBe(false);
    s.touched();
    t += 349;
    expect(s.justSwiped(350)).toBe(true);
    t += 1;
    expect(s.justSwiped(350)).toBe(false);
  });
  it("a button acts once until the row closes (no two toasts)", () => {
    const l = createLock();
    expect(l.take()).toBe(true);
    expect(l.take()).toBe(false);
    l.release();
    expect(l.take()).toBe(true);
  });
});

describe("screen reader actions go to the row's own list", () => {
  const a = rowActions({ unitPriceCents: 0, clientVisible: undefined, source: undefined }, {});
  it("a name the row offers is forwarded; a foreign one is not", () => {
    expect(actOfName("delete", a)).toBe("delete");
    expect(actOfName("hide", a)).toBe("hide");
    expect(actOfName("show", a)).toBeNull();
    expect(actOfName("activate", a)).toBeNull();
  });
  it("a signed estimate forwards nothing", () => {
    expect(actOfName("delete", rowActions({ unitPriceCents: 0, clientVisible: undefined, source: undefined }, { locked: true }))).toBeNull();
  });
});

describe("SwipeRow source guards", () => {
  const src = readFileSync(new URL("../src/features/estimate/SwipeRow.tsx", import.meta.url), "utf8");
  it("the row is opaque (the buttons lie under it) and the left edge is kept", () => {
    expect(src).toMatch(/childrenContainerStyle=\{\{\s*backgroundColor:\s*c\.bg\s*\}\}/);
    expect(src).toMatch(/hitSlop=\{\{\s*left:\s*-space\[4\]\s*\}\}/);
  });
});
