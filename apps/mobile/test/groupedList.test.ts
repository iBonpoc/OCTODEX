import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { outerPressRole, rowActions, rowSaid } from "../src/ui/groupedListLogic";

const a = (key: string) => ({ key, label: key, icon: "check" as const, onPress: () => undefined });
const src = (f: string) => readFileSync(join(__dirname, "..", "src", "ui", f), "utf8");

describe("GroupedList / GroupRow 56 (BUILD-SPEC §1)", () => {
  it("the swiped actions are also the long-press menu and the screen reader's: left first, no repeats", () => {
    expect(rowActions(undefined)).toEqual([]);
    expect(rowActions({ left: [a("done")], right: [a("move"), a("archive")] }).map((x) => x.key)).toEqual(["done", "move", "archive"]);
    expect(rowActions({ left: [a("x")], right: [a("x")] }).map((x) => x.key)).toEqual(["x"]);
  });
  it("a row is said in words, the empty parts left out", () => {
    expect(rowSaid({ title: "David Kim", subtitle: "Gutters · Oak St", value: "$1,200", status: { label: "Sent" } })).toBe("David Kim, Gutters · Oak St, $1,200, Sent");
    expect(rowSaid({ title: "David Kim" })).toBe("David Kim");
  });
  it("the row is 56 (compact 40), the hairline is inset 64, the swipe is the shared SwipeRow with accessibilityActions", () => {
    const s = src("groupedList.tsx");
    expect(s).toMatch(/component\.listRow\.h/);
    expect(s).toMatch(/component\.rowCompact/);
    expect(s).toMatch(/inset = component\.listRow\.inset/);
    expect(s).toMatch(/<SwipeRow\b/);
    expect(s).toMatch(/accessibilityActions=/);
    expect(s).toMatch(/onLongPress=/);
  });
  it("a wide column («Просрочен 9 дн») never lies over the subtitle: the columns do not shrink (a floor, not a fixed width), the text column shrinks and cuts with «…»", () => {
    for (const f of ["groupedList.tsx", "figures.tsx"]) {
      const s = src(f);
      // the columns' own block (#3035 put another right-aligned column — the sum with the number under it — before it)
      const at = s.indexOf("alignItems: \"flex-end\"", Math.max(0, s.indexOf("cols.map(")));
      const col = s.slice(at, at + 200);
      expect(col, f).toMatch(/minWidth: i < all\.length - 1 \? [A-Za-z.]*colW : undefined/);
      expect(col, f).toMatch(/flexShrink: 0/);
      expect(col, f).not.toMatch(/\bwidth: i < all/);
    }
    const body = src("groupedList.tsx");
    expect(body).toMatch(/<View style=\{\{ flex: 1, minWidth: 0 \}\}>/);
    expect(body).toMatch(/numberOfLines=\{wrap \? 2 : 1\}/);
  });
  it("a row with a status-word column («Просрочен 9 дн») lets the name take two lines — the name is not cut, the subtitle is cut first", () => {
    const s = src("groupedList.tsx");
    expect(s).toMatch(/const wordCol = !!cols\?\.some\(\(x\) => x\.tone\)/);
    // #3017: a row with a fact in the name's line (titleNote) lets the name take two lines too
    expect(s).toMatch(/numberOfLines=\{wrap \|\| wordCol \|\| titleNote \? 2 : 1\}[^>]*>\s*\{title\}/);
    expect(s).toMatch(/numberOfLines=\{wrap \? 2 : 1\}[^>]*>\s*\{subtitle\}/);
  });
  it("no button inside a button (web «<button> cannot contain a nested <button>», wave 3): the row's actions stand beside its Press", () => {
    const s = src("groupedList.tsx");
    const press = s.slice(s.indexOf("const tap ="), s.indexOf("const row ="));
    expect(press).toMatch(/<Press\b/);
    expect(press).not.toMatch(/IconButton/);
    expect(s.slice(s.indexOf("const row ="))).toMatch(/\{tap\}[\s\S]*IconButton/);
    // a card that must hold its buttons (ListCard) is a group on the web, a button on a phone
    expect(outerPressRole("web", true)).toBe("group");
    expect(outerPressRole("ios", true)).toBe("button");
    expect(outerPressRole("android", true)).toBe("button");
    expect(outerPressRole("web", false)).toBe("button");
    expect(src("listCard.tsx")).not.toMatch(/accessibilityRole=\{p\.onPress \? "button"/);
  });
});

describe("ChoiceChips / MultiChips layout=\"strip\" (BUILD-SPEC §1)", () => {
  it("one row in its own horizontal scroll, never a segment or a field", () => {
    const s = src("controls.tsx");
    expect(s).toMatch(/layout\?: "wrap" \| "strip"/);
    expect(s).toMatch(/if \(layout === "strip"\) return <ChipStrip[^\n]*<ChipsRow[^\n]*nowrap/);
    expect(s).toMatch(/function ChipStrip[\s\S]{0,200}<ScrollView horizontal/);
  });
});

describe("StatusPill (visual v2 «Плашка статуса», 21.11)", () => {
  it("icon 13 and word 13 (`caption`) semibold on the quiet status fill, 24 high, padding 7 · 9", () => {
    const s = src("statusPill.tsx");
    expect(s).toMatch(/statusGlyph\(status, draft\)/);
    expect(s).toMatch(/component\.statusPill\.icon/);
    expect(s).toMatch(/v="caption" w="semibold"/);
    expect(s).toMatch(/component\.chip\.h/);
    expect(s).toMatch(/component\.statusPill\.padL/);
    expect(s).toMatch(/st\.fill/);
  });
  it("#2992 lists B: a sum and its status are ONE column on the right — the sum, the status under it (never side by side)", () => {
    const s = src("groupedList.tsx");
    expect(s).toMatch(/value && status \? \(/);
    expect(s).toMatch(/alignItems: "flex-end", flexShrink: 0, gap: spaceHalf\.hair/);
    // the side pill is drawn only when there is no bare sum to stand under
    // (#3017/#3033: not when the status goes to line 3 with titleNote, nor when it is an icon only)
    expect(s).toMatch(/status && !status\.iconOnly && !\(value && !cols\?\.length\) && !titleNote \? <StatusPill/);
  });
  it("#3033: an icon-only status — the icon without a word, said to VoiceOver; the sum in the name's line", () => {
    const s = src("groupedList.tsx");
    expect(s).toMatch(/accessible accessibilityLabel=\{status\.label\} testID="row-status-icon"/);
    expect(s).toMatch(/const top = !!value && !titleNote && \(!!status\?\.iconOnly \|\| !!valueTop\)/);
  });
  it("#2993: a part of «Деньги» has ONE line of its sums, not the tiles (the tiles stay on the overview)", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");
    for (const f of ["app/estimates.tsx", "app/invoice/index.tsx", "app/payments/index.tsx"]) {
      expect(read(f)).toMatch(/<MoneyTotal tab=/);
      expect(read(f)).not.toMatch(/<MoneyTiles/);
      expect(read(f)).not.toMatch(/w2m\.col\.sum/);
    }
    expect(read("features/moneyTabs.tsx")).toMatch(/<SummaryLine testID="money-tiles"/);
  });
});
