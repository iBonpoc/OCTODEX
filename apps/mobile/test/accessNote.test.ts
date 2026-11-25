/** AccessNote (BUILD-SPEC §1): no note — no block; a held-back code is not drawn; the code is said digit by digit. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accessNoteSaid, accessNoteShown, spelledCode } from "../src/ui/accessNoteRules";

describe("AccessNote", () => {
  it("nothing to say — nothing drawn (blank strings count as nothing)", () => {
    expect(accessNoteShown({})).toBe(false);
    expect(accessNoteShown({ text: "  ", code: "" })).toBe(false);
    expect(accessNoteShown({ code: "#4471" })).toBe(true);
    expect(accessNoteShown({ locked: "Код откроется в день выезда" })).toBe(true);
    expect(accessNoteShown({ pinned: "Звонить за 30 минут" })).toBe(true);
  });
  it("the code is spelled one by one", () => {
    expect(spelledCode("#4471")).toBe("# 4 4 7 1");
    expect(spelledCode(" 12 34 ")).toBe("1 2 3 4");
  });
  it("is said in order: label, note, code, pinned; a locked code says when it opens, never the code", () => {
    expect(accessNoteSaid("Доступ", { text: "Ворота сбоку", code: "#4471", pinned: "Собака" }, "Код")).toBe("Доступ. Ворота сбоку. Код # 4 4 7 1. Собака");
    const held = accessNoteSaid("Доступ", { text: "Ворота сбоку", code: "#4471", locked: "Код откроется в день выезда" }, "Код");
    expect(held).toBe("Доступ. Ворота сбоку. Код откроется в день выезда");
    expect(held).not.toMatch(/4/);
  });
  it("is drawn from tokens: the warn fill, the key, the label in capitals", () => {
    const s = readFileSync(join(__dirname, "..", "src", "ui", "accessNote.tsx"), "utf8");
    expect(s).toMatch(/c\.status\.warn/);
    expect(s).toMatch(/name="key"/);
    expect(s).toMatch(/textTransform: "uppercase"/);
    expect(s).not.toMatch(/<Press\b/);
  });
});
