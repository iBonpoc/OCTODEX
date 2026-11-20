/**
 * #2329 (rule 27а): the back gesture of a stack screen while a signature field is on it — the counting.
 * С1 ДАНО экран с полем подписи КОГДА поле на экране ТОГДА жест «назад» экрана выключен.
 * С2 ДАНО два поля (на месте и встречная подпись) КОГДА ушло одно ТОГДА жест всё ещё выключен; ушло последнее — включён.
 * С3 счётчик не уходит ниже нуля (лишнее размонтирование).
 * С4 каждое поле подписи в приложении стоит рядом с <StackBackGestureOff /> (кроме самого поля и полноэкранного окна).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backGestureOn, holdCount } from "../src/nav/stackBackGesture";

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
