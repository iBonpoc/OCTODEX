/**
 * unit:undoTogetherGuard — the director's 3rd review of #1244: «Отменить» of several actions is all or nothing (DS §15.2
 * «Полуотката не бывает»), only through the store's undoTogether (or the module's undoAll). A screen or the store calling
 * several undos one after another — a loop over them, or two undo calls in a row — fails here: each part on its own may
 * be refused (undoOwn) while the others go, a silent half undo, and the refused part's op stays while its siblings' go.
 * The places that do it on purpose are listed with why.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });

/** a loop that calls every undo of a list */
const LOOP = /\bundos\b[^;\n]*\.forEach\(|\.forEach\(\s*\(?(u\w*)\)?\s*=>\s*\1\(\)\s*\)|for\s*\(const \w+ of [^)]*\bundos\b/;
/** a call of an undo-like function: `undo()`, `undoA()`, `x.undo()`, `linked?.()`, `(linked as () => void)()`, `u2?.()` */
const CALL = String.raw`(?:(?:\(\w+ as [^()]*(?:\(\)[^()]*)*\)|(?:\w+\.)?(?:undo\w*|\w*Undo\w*|linked|u\d+))\??\.?\(\)|unwrite\w*\([^()]*\))`;
/** two such calls one after another: `a(); b();` (on one line or two, in an if), or `(a(), b())` */
const ROW = new RegExp(String.raw`${CALL}\s*;\s*(?:if \([^)]*\)\s*)?(?:else\s+)?${CALL}|${CALL}\s*,\s*${CALL}`);

/**
 * on purpose, and why — each cut out by its own words, never a whole file (the director's 4th review of #1244)
 */
const ALLOWED: { file: string; text: RegExp; why: string }[] = [
  { file: "modules/gutters/data.ts", text: /\[\.\.\.undos\]\.reverse\(\)\.forEach\(\(u\) => typeof u === "function" && \(u as \(\) => unknown\)\(\)\);/, why: "undoAll's fallback for an older test store without undoTogether" },
  { file: "features/client/importDemo.ts", text: /for \(const u of job\.undos\.reverse\(\)\) \{/, why: "a client import: each card is its own record — one changed since stays (kept), as the server's undo counts it" },
  { file: "data/store.tsx", text: /for \(const u of \[\.\.\.undos\]\.reverse\(\)\)/, why: "planTogether itself" },
  { file: "data/store.tsx", text: /commits\.forEach\(\(f\) => f\(\)\);/, why: "planTogether's commit" },
];

describe("unit:undoTogetherGuard — several undos only through undoTogether", () => {
  it("no screen or store code takes back several actions one by one", () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).split("\\").join("/");
      let text = readFileSync(f, "utf8");
      for (const a of ALLOWED) {
        if (a.file !== rel) continue;
        expect(a.text.test(text), `${rel}: the allowed place «${a.why}» is gone — take it off the list`).toBe(true);
        text = text.replace(a.text, "");
      }
      const m = LOOP.exec(text) ?? ROW.exec(text);
      if (m) bad.push(`${rel}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  it("the patterns catch what they are for", () => {
    expect(LOOP.test("() => [...undos].reverse().forEach((u) => u())")).toBe(true);
    expect(LOOP.test("for (const u of job.undos.reverse()) u();")).toBe(true);
    for (const x of [
      "  undoApply();\n  undoSave?.();",
      "  undoVisit();\n  target.undo();",
      "() => { undoTech(); undoMove(); }",
      "() => ((linked as () => void)(), r.undo())",
      "done(() => (linked?.(), r.undo()), who)",
      "undo: () => (u2?.(), x.undo())",
      "      undo();\n      unwriteCatalog(settled.newItems);",
    ]) expect(ROW.test(x) || LOOP.test(x), x).toBe(true);
    expect(LOOP.test("store.undoTogether(undos)") || ROW.test("store.undoTogether([a, b])")).toBe(false);
  });
});
