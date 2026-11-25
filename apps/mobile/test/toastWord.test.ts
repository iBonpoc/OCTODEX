import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ru } from "../src/i18n/ru";

// #2747, CLAUDE.md rule 5 (estimate audit, accepted by the founder 23.11): «Вернуть» — the toast after an action;
// «Отменить» — only the revert of edits at the bottom of the editor. The toast said «Отменить» in the whole app.
describe("the toast's word is «Вернуть» (rule 5)", () => {
  it("the toast's button word", () => expect(ru["common.undo"]).toBe("Вернуть"));
  it("too late says «вернуть» too", () => expect(ru["common.undoLate"]).toMatch(/^Уже не вернуть/));
  it("the toast's button draws common.undo", () => {
    const src = readFileSync(new URL("../src/ui/overlays.tsx", import.meta.url), "utf8");
    const btn = src.slice(src.indexOf("function UndoButton"), src.indexOf("export function useToast"));
    expect(btn).toContain('t("common.undo")');
  });
  it("the editor's revert keeps «Отменить»", () => expect(ru["k1.cancel"]).toBe("Отменить"));
});
