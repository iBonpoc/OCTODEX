// #2423: the «?» of «Правки с момента открытия» names the editor's real buttons — in every language (a button renamed must not leave
// the help talking about a button that is not there); and the line hides while the phone fails to keep the edits (code review)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

describe("the help of the edits line (#2423)", () => {
  it.each([["ru", ru], ["en", en], ["es", es]] as const)("%s: names «Готово» and «Отменить» as the buttons say", (_l, d) => {
    expect(d["k1.unsavedHelp"]).toContain(`«${d["proto.est.done"]}»`);
    expect(d["k1.unsavedHelp"]).toContain(`«${d["k1.cancel"]}»`);
  });
  it("the line is not shown while the phone fails to keep the edits", () => {
    const src = readFileSync(join(__dirname, "../src/app/estimate/new.tsx"), "utf8");
    expect(src).toMatch(/existing && dirty && !signed && !keptAside && !drafts\.writeFailed \? \(\s*<View testID="k1-unsaved">/);
  });
});
