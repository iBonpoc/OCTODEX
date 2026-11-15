/**
 * #1390: the app crashed on every pinch (iPhone, build 1388, «Сбой приложения»). `gestureState.ts` ran `tf(st)` inside the worklet `closeSegment`:
 * `tf` is a plain function, not a worklet. On the web it works (one thread); on a phone a worklet runs on the UI thread, where a plain JS function
 * cannot be called: «Tried to synchronously call a non-worklet function on the UI thread» — an uncaught error there takes the app down. Nothing
 * on the web, in tsc or in a unit test of the function sees it. This guard reads the sources: a worklet may call only worklets (of its own file),
 * `scheduleOnRN`/`runOnJS` and the language's own objects.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../src");
/** every source file of the app that has a worklet in it */
const FILES: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && /["']worklet["']/.test(readFileSync(p, "utf8"))) FILES.push(p.slice(SRC.length + 1));
  }
})(SRC);

interface Fn { name: string; body: string; worklet: boolean }

/** the body of the `{ … }` that starts at `open` (brace-matched; strings and comments are rare enough here not to confuse it) */
function block(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** every named function of the file (`function f(`, `const f = (…) =>` with a `{` body) and whether its body opens with "worklet"; arrow functions inside a gesture's config are named by their key (`onUpdate`) */
function functionsOf(src: string): Fn[] {
  const out: Fn[] = [];
  const re = /(?:function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^={]+)?=>\s*\{|([A-Za-z_$][\w$]*)\s*:\s*\([^)]*\)\s*=>\s*\{)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const body = block(src, open);
    out.push({ name: (m[1] ?? m[2] ?? m[3])!, body, worklet: /^\{\s*(?:\/\/[^\n]*\n\s*)*["']worklet["']/.test(body) });
  }
  return out;
}

/** «worklet calls plain» findings of one source */
function callsOfPlain(src: string): string[] {
  const fns = functionsOf(src);
  const plain = new Set(fns.filter((f) => !f.worklet).map((f) => f.name));
  // arrow functions with an EXPRESSION body (`const tf = (st) => ({…})`) are plain functions as well: a worklet needs a block with the directive
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^={]+)?=>\s*[^{\s]/g)) plain.add(m[1]!);
  const bad: string[] = [];
  for (const f of fns.filter((x) => x.worklet)) {
    for (const c of f.body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const callee = c[1]!;
      if (callee !== f.name && plain.has(callee) && !["scheduleOnRN", "runOnJS"].includes(callee)) bad.push(`${f.name} calls ${callee}`);
    }
  }
  return [...new Set(bad)];
}

describe("a worklet calls only worklets (#1390)", () => {
  it("the guard reads the files that have worklets (it would be silent on an empty list)", () => {
    expect(FILES).toEqual(expect.arrayContaining(["modules/gutters/canvas/gestureState.ts", "modules/gutters/canvas/CanvasView.tsx"]));
  });
  it("the scanner sees the trap: a plain function called inside a worklet", () => {
    const bad = `const tf = (st) => ({ a: st.a });\nfunction close(st) {\n  "worklet";\n  return tf(st);\n}`;
    expect(callsOfPlain(bad)).toEqual(["close calls tf"]);
    const ok = `function tf(st) {\n  "worklet";\n  return { a: st.a };\n}\nfunction close(st) {\n  "worklet";\n  return tf(st);\n}`;
    expect(callsOfPlain(ok)).toEqual([]);
  });
  for (const file of FILES) {
    it(`${file}: every function a worklet calls is a worklet`, () => {
      expect(callsOfPlain(readFileSync(join(SRC, file), "utf8"))).toEqual([]);
    });
  }
});
