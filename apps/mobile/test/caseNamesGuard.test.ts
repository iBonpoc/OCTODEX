/**
 * The guard of file names (#2462). On macOS and Windows the file system ignores case, so two files whose names differ
 * only in case — or only in case plus the extension (`BackSwipe.tsx` next to `backSwipe.ts`) — make `tsc` fail with TS1149
 * while Linux (CI) stays green. So no two tracked paths may be equal once case and the code extension are dropped.
 * A component and its logic get different names (`BackSwipeView.tsx` + `backSwipe.ts`).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;

/** every tracked path → the key two paths share when a case-blind file system sees them as one module */
export function clashes(paths: string[]): string[][] {
  const by = new Map<string, string[]>();
  for (const p of paths) {
    const key = (CODE.test(p) ? p.replace(CODE, "") : p).toLowerCase();
    by.set(key, [...(by.get(key) ?? []), p]);
  }
  return [...by.values()].filter((g) => g.length > 1);
}

describe("case-blind file names (#2462)", () => {
  it("sees a clash in the shapes that broke tsc on a Mac", () => {
    expect(clashes(["a/BackSwipe.tsx", "a/backSwipe.ts", "a/Other.ts"])).toEqual([["a/BackSwipe.tsx", "a/backSwipe.ts"]]);
    expect(clashes(["a/X.ts", "a/x.ts"])).toHaveLength(1);
    expect(clashes(["a/BackSwipeView.tsx", "a/backSwipe.ts"])).toEqual([]);
  });

  it("the repository has no two paths that differ only in case", () => {
    const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(100);
    expect(clashes(files)).toEqual([]);
  });
});
