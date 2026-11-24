/**
 * unit:pairLayout — two side by side when they fit (founder 21.11.2026, #2350: «две кнопки в столбик — две кнопки в ряд… селекторы…
 * дата, время… в ряд, если помещаются»). The rule lives in src/ui (ButtonPair, FieldRow), not in each screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { buttonNeed, buttonPairLayout, fieldRowLayout } from "../src/ui/pairLayout";

const PHONE = 390 - space[4] * 2; // the content of a 390 phone (the screen's gutters)

describe("unit:pairLayout — two buttons", () => {
  it("two short labels stand in a row on a phone of 390", () => {
    expect(buttonPairLayout([{ label: "Save", icon: true }, { label: "Delete", icon: true }], PHONE)).toBe("row");
    expect(buttonPairLayout([{ label: "Сохранить", icon: true }, { label: "Удалить", icon: true }], PHONE)).toBe("row");
  });
  it("not measured yet: the labels alone decide", () => {
    expect(buttonPairLayout([{ label: "Save" }, { label: "Not now" }])).toBe("row");
    expect(buttonPairLayout([{ label: "Save" }, { label: "Not now" }], 0)).toBe("row");
  });
  it("a label longer than pair.labelMax keeps the column, whatever the width", () => {
    const long = "x".repeat(component.pair.labelMax + 1);
    expect(buttonPairLayout([{ label: "Save" }, { label: long }], 2000)).toBe("column");
    expect(buttonPairLayout([{ label: "x".repeat(component.pair.labelMax) }, { label: "Ok" }], 2000)).toBe("row");
  });
  it("one, three or none — never a pair", () => {
    expect(buttonPairLayout([{ label: "Save" }], PHONE)).toBe("column");
    expect(buttonPairLayout([{ label: "A" }, { label: "B" }, { label: "C" }], PHONE)).toBe("column");
    expect(buttonPairLayout([], PHONE)).toBe("column");
  });
  it("a narrow width: the label that no longer fits its half sends both to the column", () => {
    const b = [{ label: "Отправить SMS", icon: true }, { label: "Позже" }];
    const need = buttonNeed(b[0]!.label, true);
    expect(buttonPairLayout(b, need * 2 + space[2])).toBe("row");
    expect(buttonPairLayout(b, need * 2 + space[2] - 2)).toBe("column");
  });
  it("the need grows with the label and the icon", () => {
    expect(buttonNeed("Save", true)).toBeGreaterThan(buttonNeed("Save", false));
    expect(buttonNeed("Save and send", false)).toBeGreaterThan(buttonNeed("Save", false));
  });
});

describe("unit:pairLayout — two fields (a date and a time)", () => {
  it("a phone of 390 holds two fields in a row", () => {
    expect(fieldRowLayout(PHONE)).toBe("row");
  });
  it("narrower than two fields of pair.fieldMin — the column", () => {
    const edge = component.pair.fieldMin * 2 + space[2];
    expect(fieldRowLayout(edge)).toBe("row");
    expect(fieldRowLayout(edge - 1)).toBe("column");
    expect(fieldRowLayout(320 - space[4] * 2)).toBe("column");
  });
  it("one field is never a row; not measured — a row", () => {
    expect(fieldRowLayout(PHONE, 1)).toBe("column");
    expect(fieldRowLayout(undefined)).toBe("row");
  });
  it("three fields need three minimums", () => {
    expect(fieldRowLayout(component.pair.fieldMin * 3 + space[2] * 2, 3)).toBe("row");
    expect(fieldRowLayout(PHONE, 3)).toBe("column");
  });
});

describe("unit:pairLayout — the screens use the rule, not their own rows", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");
  it("ButtonPair and FieldRow ask pairLayout", () => {
    expect(src("ui/pairs.tsx")).toMatch(/buttonPairLayout\(/);
    expect(src("ui/pairs.tsx")).toMatch(/fieldRowLayout\(/);
  });
  it("the event form: the day and the start in one DateField row, save and remove a ButtonPair", () => {
    const ev = src("features/EventForm.tsx");
    expect(ev).toMatch(/<DateField[\s\S]*beside=/);
    expect(ev).toMatch(/<ButtonPair/);
  });
});
