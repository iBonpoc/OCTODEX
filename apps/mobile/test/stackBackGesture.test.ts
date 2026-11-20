/**
 * #2329 (rule 27а): the back gesture of a stack screen while a signature field is on it — the counting.
 * С1 ДАНО экран с полем подписи КОГДА поле на экране ТОГДА жест «назад» экрана выключен.
 * С2 ДАНО два поля (на месте и встречная подпись) КОГДА ушло одно ТОГДА жест всё ещё выключен; ушло последнее — включён.
 * С3 счётчик не уходит ниже нуля (лишнее размонтирование).
 * С4 каждое поле подписи в приложении стоит рядом с <StackBackGestureOff /> (кроме самого поля и полноэкранного окна).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backGestureOn, holdBackGesture, holdCount } from "../src/nav/stackBackGesture";

describe("unit:stackBackGesture — the counting", () => {
  it("С1 no field → the gesture is on; one field → off", () => {
    expect(backGestureOn(0)).toBe(true);
    expect(backGestureOn(holdCount(0, 1))).toBe(false);
  });
  it("С2 two fields: back on only after the last one leaves", () => {
    let n = holdCount(holdCount(0, 1), 1);
    expect(backGestureOn(n)).toBe(false);
    n = holdCount(n, -1);
    expect(backGestureOn(n)).toBe(false);
    n = holdCount(n, -1);
    expect(backGestureOn(n)).toBe(true);
  });
  it("С3 never below zero", () => {
    expect(holdCount(0, -1)).toBe(0);
    expect(backGestureOn(holdCount(holdCount(0, -1), -1))).toBe(true);
  });
});

describe("unit:stackBackGesture — the hold on a screen's navigation", () => {
  const fake = () => {
    const calls: boolean[] = [];
    return { calls, nav: { setOptions: (o: { gestureEnabled: boolean }) => void calls.push(o.gestureEnabled) } };
  };
  it("С5 a field comes: the gesture goes off; it leaves: the gesture is the screen's own (on)", () => {
    const { nav, calls } = fake();
    const release = holdBackGesture(nav);
    expect(calls).toEqual([false]);
    release();
    expect(calls).toEqual([false, true]);
  });
  it("С6 a screen that has its gesture off by its own options keeps it off after the field leaves (own=false)", () => {
    const { nav, calls } = fake();
    holdBackGesture(nav, false)();
    expect(calls).toEqual([false, false]);
  });
  it("С7 two fields on one screen: on again only after the last one; a second release of the same field does nothing", () => {
    const { nav, calls } = fake();
    const a = holdBackGesture(nav);
    const b = holdBackGesture(nav);
    a();
    a();
    expect(calls.at(-1)).toBe(false);
    b();
    expect(calls.at(-1)).toBe(true);
  });
  it("С8 a screen that is gone (setOptions throws) is not an error", () => {
    const nav = { setOptions: () => { throw new Error("gone"); } };
    expect(() => holdBackGesture(nav)()).not.toThrow();
  });
});

describe("<StackBackGestureOff /> — the component calls the hold (hooks run by hand)", () => {
  afterEach(() => vi.resetModules());
  const load = async (os: string, nav: unknown) => {
    vi.resetModules();
    let cleanup: (() => void) | undefined;
    vi.doMock("react", () => ({ useEffect: (fn: () => (() => void) | void) => { cleanup = fn() as (() => void) | undefined; } }));
    vi.doMock("react-native", () => ({ Platform: { OS: os } }));
    vi.doMock("expo-router", () => ({ useNavigation: () => { if (nav === "throws") throw new Error("no navigator"); return nav; } }));
    const { StackBackGestureOff } = await import("../src/nav/StackBackGestureOff");
    return { render: () => StackBackGestureOff({}), cleanup: () => cleanup?.() };
  };
  it("С9 on a phone: setOptions(false) on mount, setOptions(true) on unmount — red without either call", async () => {
    const calls: boolean[] = [];
    const m = await load("ios", { setOptions: (o: { gestureEnabled: boolean }) => calls.push(o.gestureEnabled) });
    m.render();
    expect(calls).toEqual([false]);
    m.cleanup();
    expect(calls).toEqual([false, true]);
  });
  it("С10 on the web nothing is set; outside a navigator nothing throws", async () => {
    const calls: boolean[] = [];
    const web = await load("web", { setOptions: (o: { gestureEnabled: boolean }) => calls.push(o.gestureEnabled) });
    web.render();
    expect(calls).toEqual([]);
    const none = await load("ios", "throws");
    expect(() => none.render()).not.toThrow();
  });
});

describe("stackBackGesture — every signature field has its guard (#2329)", () => {
  const src = join(__dirname, "..", "src");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(f)) files.push(p);
    }
  };
  walk(src);
  it("С4 a file that draws <SignaturePad …> also has <StackBackGestureOff", () => {
    const bad = files
      .filter((f) => !f.endsWith(join("features", "SignaturePad.tsx")))
      .filter((f) => /<SignaturePad\b/.test(readFileSync(f, "utf8")) && !/<StackBackGestureOff\b/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
