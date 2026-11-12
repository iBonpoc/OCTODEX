/**
 * unit:undoBrand — #1261 (the director's 4th review of #1244): «Отменить» is all or nothing, and the TYPES hold it. The
 * toast takes only a GuardedUndo; only the store makes one (mutate, undoTogether — markUndo), plus the plain wrappers of
 * data/undo.ts (NO_UNDO, withAfter, whenLate, orElse, localUndo — a screen's own state, TOO_LATE — the showcase) and the
 * module's asUndo (what moduleOp gave). A screen's `() => { a(); b(); }` does not compile (checked below by
 * @ts-expect-error: if the brand were dropped, tsc fails on the unused directive). Each escape is checked here by file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { localUndo, NO_UNDO, orElse, TOO_LATE, whenLate, withAfter, type GuardedUndo } from "../src/data/undo";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const all = files(SRC).map((f) => ({ rel: relative(SRC, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));

/** what the toast takes (overlays.tsx useToast().show) */
type Show = (text: string, undo?: GuardedUndo) => void;
const show: Show = () => {};

describe("unit:undoBrand — the toast takes only the store's undo", () => {
  it("types: a plain function, two undos in one, a boolean function — none compiles", () => {
    const a = NO_UNDO;
    const b = TOO_LATE;
    // @ts-expect-error a screen's own function is not an undo
    show("x", () => {});
    // @ts-expect-error two undos one after another — a silent half undo
    show("x", () => {
      a();
      b();
    });
    // @ts-expect-error a function returning boolean is not branded either
    show("x", () => true);
    show("x", a);
    show("x", withAfter(a, () => {}));
    expect(true).toBe(true);
  });
  it("markUndo is the store's alone; a cast to GuardedUndo only in data/undo.ts and the module's asUndo", () => {
    const marks = all.filter((f) => /\bmarkUndo\b/.test(f.text)).map((f) => f.rel).sort();
    expect(marks).toEqual(["data/store.tsx", "data/undo.ts"]);
    const casts = all.filter((f) => /as (unknown as )?GuardedUndo\b/.test(f.text)).map((f) => f.rel).sort();
    expect(casts).toEqual(["data/undo.ts", "modules/gutters/data.ts"]);
  });
  it("localUndo holds a screen's own state only: no store action, no other undo in it", () => {
    const bad: string[] = [];
    for (const f of all) {
      for (const m of f.text.matchAll(/localUndo\(\(\) =>/g)) {
        // the body up to the matching parenthesis
        let depth = 0;
        let end = m.index! + "localUndo".length;
        for (let i = end; i < f.text.length; i++) {
          if (f.text[i] === "(") depth++;
          else if (f.text[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        const body = f.text.slice(m.index!, end);
        // the one allowed: a client import's undo is the run's own (the server's, the demo's per card), then a read
        if (/\bstore\.(?!db\b)\w+\(|\bundo\w*\(\)|\.undo\(\)/.test(body.replace(/driver\.undo\(\)/, "").replace(/store\.refresh\(\)/, ""))) bad.push(`${f.rel}: ${body.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the wrappers: withAfter only on true; whenLate says it and closes; orElse falls back on false only", () => {
    let after = 0;
    expect(withAfter(TOO_LATE, () => after++)()).toBe(false);
    expect(withAfter(NO_UNDO, () => after++)()).toBeUndefined();
    expect(withAfter(localUndo(() => {}), () => after++)()).toBe(true);
    expect(after).toBe(1);
    let late = 0;
    expect(whenLate(TOO_LATE, () => late++)()).toBeUndefined();
    expect(late).toBe(1);
    expect(orElse(TOO_LATE, localUndo(() => {}))()).toBe(true);
    expect(orElse(NO_UNDO, TOO_LATE)()).toBeUndefined();
  });
});
