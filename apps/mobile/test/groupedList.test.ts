import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rowActions, rowSaid } from "../src/ui/groupedListLogic";

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
});

describe("ChoiceChips / MultiChips layout=\"strip\" (BUILD-SPEC §1)", () => {
  it("one row in its own horizontal scroll, never a segment or a field", () => {
    const s = src("controls.tsx");
    expect(s).toMatch(/layout\?: "wrap" \| "strip"/);
    expect(s).toMatch(/if \(layout === "strip"\) return <ChipStrip[^\n]*<ChipsRow[^\n]*nowrap/);
    expect(s).toMatch(/function ChipStrip[\s\S]{0,200}<ScrollView horizontal/);
  });
});

describe("StatusPill (BUILD-SPEC §1)", () => {
  it("icon 12 and word 12 semibold on the status fill, chip 24 × px 10", () => {
    const s = src("statusPill.tsx");
    expect(s).toMatch(/statusIcon\[status\]/);
    expect(s).toMatch(/size\.iconXs/);
    expect(s).toMatch(/v="micro" w="semibold"/);
    expect(s).toMatch(/component\.chip\.h/);
    expect(s).toMatch(/component\.chip\.px/);
    expect(s).toMatch(/st\.fill/);
  });
});
