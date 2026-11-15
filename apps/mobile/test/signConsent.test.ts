/** #1104 п.5: the estimate is not «completed work» — only the visit's signature confirms that. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tFor } from "../src/i18n/translate";

const SRC = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx$/.test(f) && files.push(join(d, f))));
walk(SRC);

describe("the line under a signature pad", () => {
  it("the estimate's own line does not say «выполненную работу» / «completed work»", () => {
    expect(tFor("ru")("est.signConsent")).toBe("Подписывая, клиент принимает смету и сумму.");
    expect(tFor("ru")("est.signConsent")).not.toMatch(/выполненн/i);
    expect(tFor("en")("est.signConsent")).not.toMatch(/completed/i);
    expect(tFor("es")("est.signConsent")).not.toMatch(/realizad|complet/i);
  });
  it("only the visit's pad uses the default line (completed work); every other <SignaturePad> says what it confirms, or nothing", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<SignaturePad\b[^>]*?(?:\n[^>]*?)*?>/g)) {
        if (!/\bconsent=/.test(m[0]) && !f.endsWith(join("app", "visit", "[id].tsx"))) bad.push(f.slice(SRC.length));
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("a closed visit promises nothing that does not exist (#1104 п.6)", () => {
  it("no «report goes to the client» on the closed visit: there is no report", () => {
    for (const lang of ["ru", "en", "es"] as const) expect(tFor(lang)("visit.completedHint"), lang).not.toMatch(/отч[её]т|report|informe/i);
  });
});
