/**
 * Choice controls (DS §21.2 п.27, spec 56 §9.3; wave 1а): one question — one element. The old places are lists by file with a
 * count; a list only goes down (each wave of spec 56 crosses its files out). A new place is a list change with the founder's or
 * the reviewer's word (DS §21.2 п.27.12).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { rovingMove } from "../src/ui/rovingKeys";

const ROOT = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !p.includes(join("src", "i18n"))) files.push(p);
  }
};
walk(ROOT);
const rel = (f: string) => relative(ROOT, f).split("\\").join("/");
const src = (f: string) => readFileSync(f, "utf8");
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

/** now vs the list: a place over its count (or a new file) is red, and so is a list that is higher than the code (lower it) */
function againstList(now: Record<string, number>, list: Record<string, number>) {
  const over = Object.entries(now).filter(([k, n]) => n > (list[k] ?? 0)).map(([k, n]) => `${k}: ${n} > ${list[k] ?? 0}`);
  const less = Object.entries(list).filter(([k, n]) => (now[k] ?? 0) < n).map(([k, n]) => `${k}: ${now[k] ?? 0} < ${n} — lower the list`);
  return { over, less };
}

/** the body of `export function <name>(` up to the next top-level `\n}\n` */
function cutFunction(s: string, name: string): string {
  const at = s.indexOf(`export function ${name}(`);
  if (at < 0) return s;
  const end = s.indexOf("\n}\n", at);
  return s.slice(0, at) + s.slice(end < 0 ? s.length : end + 3);
}

describe("choice controls (DS §21.2 п.27, spec 56 §9.3)", () => {
  // п.27.3: a checkbox — role `checkbox` or `accessibilityState.checked` — only in DoneCircle (a mark of a deed) and the switch
  // (Toggle, and ToggleRow, the row that is the switch). Old places by file: they go with waves 2–6 and G of spec 56.
  const CHECKED_ALLOWED = ["ui/doneCircle.tsx", "ui/toggleRow.tsx"];
  const CHECKED_LEGACY: Record<string, number> = {
    "features/LegalAgree.tsx": 2,
    "features/VisitChecklist.tsx": 2,
    "features/estimate/OptionsCard.tsx": 2,
    "features/showcase/Rows.tsx": 1,
    "modules/gutters/draw/AttrPanel.tsx": 1,
    "modules/gutters/draw/CornerSheet.tsx": 1,
    "modules/gutters/settings/SettingsScreen.tsx": 2,
    "ui/controls.tsx": 4,
    "ui/filterBar.tsx": 2,
    "ui/listCard.tsx": 2,
  };
  it("п.27.3: role «checkbox» and accessibilityState.checked only in DoneCircle and the switch; the old places only go down", () => {
    const now: Record<string, number> = {};
    for (const f of files) {
      const r = rel(f);
      if (CHECKED_ALLOWED.includes(r)) continue;
      let s = src(f);
      if (r === "ui/controls.tsx") s = cutFunction(s, "Toggle");
      const n = count(s, /accessibilityRole=\{?\s*["']checkbox["']/g) + count(s, /accessibilityState=\{[^\n]*\bchecked\s*:/g);
      if (n) now[r] = n;
    }
    const { over, less } = againstList(now, CHECKED_LEGACY);
    expect(over, `a checkbox outside DoneCircle / Toggle (DS §9 «ЗАПРЕЩЕНО», spec 56 §6): OptionRow multiple for a choice, DoneCircle for a deed:\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });
  it("DoneCircle is a checkbox with checked; ToggleRow is a switch", () => {
    const d = src(join(ROOT, "ui", "doneCircle.tsx"));
    expect(d).toMatch(/accessibilityRole="checkbox"/);
    expect(d).toMatch(/accessibilityState=\{\{ checked: done/);
    expect(src(join(ROOT, "ui", "toggleRow.tsx"))).toMatch(/accessibilityRole="switch"/);
  });

  // п.27.6: the switch stands only in its row (ToggleRow: the whole row presses, the label is the switch's). Old places by file.
  const TOGGLE_LEGACY: Record<string, number> = {
    "app/company/[section].tsx": 5,
    "app/company/checklist/[id].tsx": 5,
    "app/company/checklists.tsx": 2,
    "app/company/intake.tsx": 3,
    "app/company/schedule.tsx": 1,
    "app/estimate/new.tsx": 1,
    "app/f/[token].tsx": 1,
    "app/purchase-order/[id].tsx": 1,
    "app/settings/delete-account.tsx": 1,
    "app/settings/index.tsx": 2,
    "app/team.tsx": 1,
    "features/EstimateView.tsx": 1,
    "features/JobLinesBlock.tsx": 2,
    "features/PushSettings.tsx": 2,
    "features/SignBlock.tsx": 1,
    "features/VisitChecklist.tsx": 2,
    "features/estimate/LineRow.tsx": 4,
    "features/showcase/Haptics.tsx": 1,
    "features/showcase/Rows.tsx": 2,
    "modules/gutters/draw/AttrPanel.tsx": 1,
    "modules/gutters/draw/CornerSheet.tsx": 1,
    "modules/gutters/draw/DrawScreen.tsx": 1,
    "modules/gutters/settings/SettingsScreen.tsx": 1,
  };
  it("п.27.6: <Toggle only inside ToggleRow; the old places only go down", () => {
    const now: Record<string, number> = {};
    for (const f of files) {
      const r = rel(f);
      if (r === "ui/toggleRow.tsx") continue;
      const n = count(src(f), /<Toggle\b/g);
      if (n) now[r] = n;
    }
    const { over, less } = againstList(now, TOGGLE_LEGACY);
    expect(over, `a bare Toggle (DS §9 А5): use ToggleRow — label left, the switch right, the whole row presses:\n${over.join("\n")}`).toEqual([]);
    expect(less, less.join("\n")).toEqual([]);
  });

  // п.27.12: named exceptions — only in the places of the list. Wave 1а: the showcase only; the screens join with their waves
  // (PctUsdField — the places of §20 row 13а / spec 56 §3 row 5б; OptionTiles — the Gutters corner, wave G). Never in the
  // company's markup (percent only, CHECK of spec 55).
  const PLACES: Record<string, string[]> = {
    PctUsdField: ["features/showcase/Choice.tsx"],
    OptionTiles: ["features/showcase/Choice.tsx"],
  };
  for (const [name, allowed] of Object.entries(PLACES)) {
    it(`п.27.12: <${name} only in the places of the list`, () => {
      const hits = files.filter((f) => !rel(f).startsWith("ui/") && new RegExp(`<${name}\\b`).test(src(f))).map(rel);
      expect(hits.filter((h) => !allowed.includes(h)), `${name} outside its list (DS §21.2 п.27.12): a new place needs the founder's or the reviewer's word`).toEqual([]);
    });
  }
  it("п.27.12: no PctUsdField in the company's markup settings", () => {
    const hits = files.filter((f) => /company/.test(rel(f)) && /markup/i.test(src(f)) && /<PctUsdField\b/.test(src(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe("choice rows: web keys (DS §9 А2а)", () => {
  it("↑ / ↓ move within the rows, Home / End go to the ends, others do nothing", () => {
    expect(rovingMove(3, 0, "ArrowDown")).toBe(1);
    expect(rovingMove(3, 2, "ArrowDown")).toBe(2);
    expect(rovingMove(3, 0, "ArrowUp")).toBe(0);
    expect(rovingMove(3, -1, "ArrowDown")).toBe(0);
    expect(rovingMove(3, 1, "Home")).toBe(0);
    expect(rovingMove(3, 1, "End")).toBe(2);
    expect(rovingMove(3, 1, "a")).toBeNull();
    expect(rovingMove(0, 0, "ArrowDown")).toBeNull();
  });
});
