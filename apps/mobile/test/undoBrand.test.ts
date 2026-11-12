/**
 * unit:undoBrand — #1261 (the director's 4th review of #1244): «Отменить» is all or nothing, and the TYPES hold it. The
 * toast takes only a GuardedUndo; only the store makes one (mutate, undoTogether — markUndo), plus the plain wrappers of
 * data/undo.ts (NO_UNDO, withAfter, whenLate, orElse, localUndo — a screen's own state, TOO_LATE — the showcase) and the
 * module's asUndo (what moduleOp gave). A screen's `() => { a(); b(); }` does not compile (checked below by
 * @ts-expect-error: if the brand were dropped, tsc fails on the unused directive). Each escape is checked here by file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

// the module's data reads the cloud client (not used here): as the gutters tests do
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/cloud/ops", () => ({ PermanentError: class extends Error {}, uploadPhoto: () => null }));
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
    // @ts-expect-error a store's undo is not a screen's own state (review of #1279 №1)
    localUndo(a);
    // @ts-expect-error withAfter takes the store's undo, not a function of the screen
    withAfter(() => true, () => {});
    expect(true).toBe(true);
  });
  it("markUndo is the store's alone; a cast to GuardedUndo only in data/undo.ts and the module's asUndo", () => {
    const marks = all.filter((f) => /\bmarkUndo\b/.test(f.text)).map((f) => f.rel).sort();
    expect(marks).toEqual(["data/store.tsx", "data/undo.ts"]);
    const casts = all.filter((f) => /as (unknown as )?(import\([^)]*\)\.)?GuardedUndo\b/.test(f.text)).map((f) => f.rel).sort();
    expect(casts).toEqual(["data/undo.ts", "modules/gutters/data.ts"]);
  });
  it("localUndo holds a screen's own state only: no store action (by name, destructured too), no undo, no call without arguments", () => {
    // the store's functions by name (StoreCtx in store.tsx): `const { addLead } = store` is caught too
    const store = readFileSync(join(SRC, "data", "store.tsx"), "utf8");
    const ctx = store.slice(store.indexOf("interface StoreCtx {"), store.indexOf("\n}\n", store.indexOf("interface StoreCtx {")));
    const names = [...ctx.matchAll(/^  (\w+)\??:/gm)].map((m) => m[1]!).filter((n) => !["db", "mode", "role", "online"].includes(n));
    expect(names.length).toBeGreaterThan(50);
    const storeCall = new RegExp(String.raw`\b(?:${names.join("|")})\(`);
    const bad: string[] = [];
    for (const f of all) {
      for (const m of f.text.matchAll(/localUndo\(/g)) {
        let depth = 0;
        let end = m.index! + "localUndo".length;
        for (let i = end; i < f.text.length; i++) {
          if (f.text[i] === "(") depth++;
          else if (f.text[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        const body = f.text.slice(m.index! + "localUndo(".length, end);
        // the one allowed: a client import's undo is the run's own (the server's, the demo's per card), then a read
        const rest = f.rel === "app/client/import.tsx" ? body.replace(/r\.driver\.undo\(\)/, "").replace(/store\.refresh\(\)/, "") : body;
        // not a function written right here (`localUndo(back)`), a store action, an undo, a call without arguments
        if (!/^\s*\(\)\s*=>/.test(body) || storeCall.test(rest) || /\bstore\.(?!db\b)\w+\(/.test(rest) || /\bundo\w*\(|\.undo\(|\b\w+\(\)/.test(rest.replace(/^\s*\(\)\s*=>/, "")))
          bad.push(`${f.rel}: ${body.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("no way around the types near the toast: no cast in what toast.show / an onUndo gets; asUndo only in a module's data.ts", () => {
    const bad: string[] = [];
    for (const f of all) {
      for (const m of f.text.matchAll(/\b(?:toast\.show|show|onUndo|say|saved|done)\(/g)) {
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (let i = end; i < f.text.length; i++) {
          if (f.text[i] === "(") depth++;
          else if (f.text[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        const args = f.text.slice(m.index!, end);
        if (/\bas (never|any|unknown)\b|GuardedUndo/.test(args)) bad.push(`${f.rel}: ${args.slice(0, 80)}`);
      }
      if (/\basUndo\(/.test(f.text) && !/^modules\/[^/]+\/data\.ts$/.test(f.rel)) bad.push(`${f.rel}: asUndo`);
    }
    expect(bad).toEqual([]);
  });
  it("a module's asUndo: the store's undo as it is; any other function — NO_UNDO (review of #1279 Б2)", async () => {
    const { asUndo } = await import("../src/modules/gutters/data");
    const { markUndo } = await import("../src/data/undo");
    let ran = 0;
    const own = asUndo(() => {
      ran++;
      return true;
    })!;
    expect(own).toBe(NO_UNDO);
    expect(own()).toBeUndefined();
    expect(ran).toBe(0);
    const storeMade = markUndo(() => true);
    expect(asUndo(storeMade)).toBe(storeMade);
    expect(asUndo(null)).toBeNull();
  });
  it("a store undo, once back, is done: a second call is too late; its readiness says no (review of #1279 №3)", async () => {
    const { markUndo, markOf } = await import("../src/data/undo");
    let n = 0;
    const u = markUndo(() => (n++, true), (v) => v === "ok");
    expect(markOf(u)!.ready("ok")).toBe(true);
    expect(markOf(u)!.ready("no")).toBe(false);
    expect(u()).toBe(true);
    expect(u()).toBe(false);
    expect(n).toBe(1);
    expect(markOf(u)!.ready("ok")).toBe(false);
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
