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
/** two undo calls in a row: `undoA(); undoB();` (also `x.undo();`, `undoB?.();`) */
const ROW = /\b(?:\w+\.)?undo\w*\??\.?\(\);\s*\n\s*(?:if \([^)]*\) )?(?:\w+\.)?undo\w*\??\.?\(\);/i;

/** on purpose, and why */
const ALLOWED: Record<string, string> = {
  // the fallback for an older test store without undoTogether (registry.ts: undoTogether is optional)
  "modules/gutters/data.ts": "undoAll's fallback",
  // a client import: each card is its own record — one changed since stays (kept), as the server's undo counts it
  "features/client/importDemo.ts": "per card, counted as kept",
  // reverse ops: new changes that always apply, never refused — no half undo (store.tsx saveItemsBoth, saveSupplier)
  "data/store.tsx#reverse": "saveItemsBoth / saveSupplier reverse ops",
};

describe("unit:undoTogetherGuard — several undos only through undoTogether", () => {
  it("no screen or store code takes back several actions one by one", () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).split("\\").join("/");
      if (ALLOWED[rel]) continue;
      let text = readFileSync(f, "utf8");
      if (rel === "data/store.tsx") {
        // the two reverse-op places, cut out by their own words
        text = text.replace(/\[\.\.\.pairs\]\.reverse\(\)\.forEach\(\(\{ prev, next \}\) => go\(next, prev, back\)\);/, "").replace(/undoItems\(\);\s*\n\s*if \(before\) put\(before\);\s*\n\s*else undoSup\(\);/, "");
        // planTogether itself runs what is not the store's
        text = text.replace(/commits\.forEach\(\(f\) => f\(\)\);/, "").replace(/for \(const u of \[\.\.\.undos\]\.reverse\(\)\)/, "");
      }
      if (LOOP.test(text) || ROW.test(text)) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });
  it("the patterns catch what they are for", () => {
    expect(LOOP.test("() => [...undos].reverse().forEach((u) => u())")).toBe(true);
    expect(LOOP.test("for (const u of job.undos.reverse()) u();")).toBe(true);
    expect(ROW.test("  undoApply();\n  undoSave?.();")).toBe(true);
    expect(ROW.test("  undoVisit();\n  target.undo();")).toBe(true);
    expect(LOOP.test("store.undoTogether(undos)") || ROW.test("store.undoTogether([a, b])")).toBe(false);
  });
});
