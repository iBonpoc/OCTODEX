/**
 * «Один залитый акцент на экран» (the founder 21.11, #2350; LAYOUT-RULES П3): a screen draws at most ONE filled accent button —
 * its main step. A `Button` with no `variant` (the default is `primary`) or `variant="primary"`, and a `MainStep` that is not
 * `outline`, count; an outlined / secondary one, the selected tab and day (a choice, not a button) do not. The templates keep it by
 * construction (`filledAccents`, screenTemplates.test.ts); this guard reads the screens and their parts (`src/app`, `src/features`).
 * The count is static — the branches of one file that are never on the screen together count too — so the files found over one on
 * 21.11 are listed with their count: it may only go DOWN (fix with the screen's wave); a new file over one is red. The showcase is a
 * gallery of samples, not a screen, and is not read.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(f)) files.push(p);
  }
};
walk(join(SRC, "app"));
walk(join(SRC, "features"));

/** the JSX opening tags `<Name …>` of a source, props and all (braces and strings skipped) */
export function tagsOf(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + name.length + 1;
    let depth = 0;
    let q: string | null = null;
    for (; i < src.length; i++) {
      const ch = src[i]!;
      if (q) {
        if (ch === q && src[i - 1] !== "\\") q = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") q = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

export function filledCount(src: string): number {
  const buttons = tagsOf(src, "Button").filter((t) => !/\bvariant=/.test(t) || /\bvariant=["']primary["']/.test(t)).length;
  const steps = tagsOf(src, "MainStep").filter((t) => !/\boutline\b/.test(t)).length;
  return buttons + steps;
}

/** found on 21.11 (static count, branches included) — may only go down */
const DEBT: Record<string, number> = {
  "app/(tabs)/triage.tsx": 12,
  "app/auth/invite.tsx": 2,
  "app/auth/sign-in.tsx": 3,
  "app/client/import.tsx": 3,
  "app/company/[section].tsx": 4,
  "app/company/checklist/[id].tsx": 2,
  "app/company/intake.tsx": 3,
  "app/company/modules.tsx": 2,
  "app/estimate/new.tsx": 5,
  "app/p/[token].tsx": 3,
  "app/purchase-order/[id].tsx": 2,
  "app/settings/profile.tsx": 3,
  "app/suppliers/[id].tsx": 2,
  "app/team.tsx": 6,
  "features/EstimateCard.tsx": 6,
  "features/VisitChecklist.tsx": 2,
  "features/client/ClientSheets.tsx": 2,
  "features/client/PropertySheets.tsx": 3,
  "features/estimate/OptionsCard.tsx": 2,
  "features/lead/LeadParts.tsx": 4,
  "features/lead/LeadSheets.tsx": 4,
};

describe("one filled accent on a screen", () => {
  it("the scanner: a default / primary Button and a not-outlined MainStep count, the rest do not", () => {
    expect(filledCount(`<Button label="a" onPress={() => go(x > 1)} />`)).toBe(1);
    expect(filledCount(`<Button variant="primary" label="a" />`)).toBe(1);
    expect(filledCount(`<Button variant="secondary" label="a" /><Button variant={"danger"} label="b" />`)).toBe(0);
    expect(filledCount(`<MainStep placement="top" main={m} /><MainStep placement="top" outline main={m} />`)).toBe(1);
  });
  it("no screen file has more than one, except the debt of 21.11 — which may only go down", () => {
    const over: string[] = [];
    for (const f of files) {
      const rel = relative(SRC, f).split("\\").join("/");
      if (rel.startsWith("features/showcase/")) continue;
      const n = filledCount(readFileSync(f, "utf8"));
      const allowed = DEBT[rel] ?? 1;
      if (n > allowed) over.push(`${rel}: ${n} filled (allowed ${allowed}) — one main step per screen; the rest secondary / outline`);
    }
    expect(over, over.join("\n")).toEqual([]);
  });
});
