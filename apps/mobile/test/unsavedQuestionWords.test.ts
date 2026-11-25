/**
 * #2485 п.3 / DS Б1 «Вопрос о несохранённом — одно правило»: the third button of the question «Сохранить изменения?» is
 * «Продолжить правку» (Keep editing / Seguir editando) — never «Отмена» / «Назад». One key (`sheet.keepEditing`) serves
 * the sheet (`Sheet dirty`) and the gutter window's dialog on 820/1280.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const app = join(__dirname, "..");
const LANGS = { ru: "Продолжить правку", en: "Keep editing", es: "Seguir editando" } as const;
const BAD = /^(Отмена|Назад|Отменить|Cancel|Back|Cancelar|Atrás)$/i;
const val = (lang: string, key: string) => {
  const m = readFileSync(join(app, "src/i18n", `${lang}.ts`), "utf8").match(new RegExp(`^\\s*"${key.replace(".", "\\.")}":\\s*(".*"),?\\s*$`, "m"));
  return m ? (JSON.parse(m[1]) as string) : undefined;
};

describe("the question about unsaved changes — one rule", () => {
  for (const [lang, word] of Object.entries(LANGS)) {
    it(`${lang}: third button is «${word}», no «Отмена» / «Назад» among the question's words`, () => {
      expect(val(lang, "sheet.keepEditing")).toBe(word);
      for (const k of ["sheet.unsavedTitle", "sheet.unsavedText", "sheet.discard", "sheet.keepEditing"]) expect(val(lang, k) ?? "").not.toMatch(BAD);
    });
  }
  it("the sheet and the window dialog use the key, not common.cancel / common.back", () => {
    const sheet = readFileSync(join(app, "src/ui/overlays.tsx"), "utf8");
    const ask = sheet.slice(sheet.indexOf('t("sheet.unsavedTitle")'), sheet.indexOf('data-testid="sheet-body"') > 0 ? undefined : sheet.indexOf("sheet-body"));
    expect(ask).toContain('t("sheet.keepEditing")');
    const draw = readFileSync(join(app, "src/modules/gutters/draw/DrawScreen.tsx"), "utf8");
    const i = draw.indexOf('t("sheet.unsavedTitle")');
    const block = draw.slice(i, i + 700);
    expect(block).toContain('t("sheet.keepEditing")');
    expect(block).not.toMatch(/common\.(cancel|back)/);
  });
});
