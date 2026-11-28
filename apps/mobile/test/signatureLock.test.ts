import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { padScrollLock } from "@/features/signatureLock";

// #3156: the pad's scroll lock — on with the stroke, off with its end, and off when the pad leaves the screen mid-stroke
const spy = () => {
  const calls: boolean[] = [];
  return { calls, lock: () => (on: boolean) => void calls.push(on) };
};

describe("padScrollLock (#3156)", () => {
  it("a stroke: on at grant, off at release", () => {
    const s = spy();
    const p = padScrollLock(s.lock);
    p.grant();
    expect(p.held).toBe(true);
    p.release();
    expect(s.calls).toEqual([true, false]);
  });
  it("a stroke taken by the system: off at terminate", () => {
    const s = spy();
    const p = padScrollLock(s.lock);
    p.grant();
    p.terminate();
    expect(s.calls).toEqual([true, false]);
  });
  it("the pad leaves the screen with the finger on it: the lock is let go (the screen scrolls again)", () => {
    const s = spy();
    const p = padScrollLock(s.lock);
    p.grant();
    p.unmount();
    expect(s.calls).toEqual([true, false]);
    expect(p.held).toBe(false);
  });
  it("leaving without a stroke, or a second release, touches nothing", () => {
    const s = spy();
    const p = padScrollLock(s.lock);
    p.unmount();
    p.grant();
    p.release();
    p.release();
    p.unmount();
    expect(s.calls).toEqual([true, false]);
  });
  it("the latest lock function is the one called (the screen's may change)", () => {
    const a: boolean[] = [];
    const b: boolean[] = [];
    let cur = (on: boolean) => void a.push(on);
    const p = padScrollLock(() => cur);
    p.grant();
    cur = (on: boolean) => void b.push(on);
    p.unmount();
    expect([a, b]).toEqual([[true], [false]]);
  });
});

describe("SignaturePad wires it (#3156)", () => {
  const src = readFileSync(join(__dirname, "..", "src", "features", "SignaturePad.tsx"), "utf8");
  it("the gesture goes through padScrollLock and the pad lets the lock go on unmount", () => {
    expect(src).toMatch(/padScrollLock\(/);
    expect(src).toMatch(/onPanResponderGrant:[\s\S]*?\.grant\(\)/);
    expect(src).toMatch(/onPanResponderRelease: \(\) => \w+\.release\(\)/);
    expect(src).toMatch(/onPanResponderTerminate: \(\) => \w+\.terminate\(\)/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => (\w+)\.unmount\(\), \[\1\]\)/);
  });
});
