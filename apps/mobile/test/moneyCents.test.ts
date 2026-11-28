/**
 * #2888 (founder #2672: «сумма должна быть с центами»; DS §4.5 «всегда с центами — везде»): every amount the app shows —
 * lists, tiles, cards, sheets, the client's PDF — has its cents, «$1,840.00», never «$1,840»; never rounded to dollars.
 * С1 the app's `money`, the tiles' `moneyWhole` (through I18n — the same function) and the PDF's `docMoney`: whole dollars → «.00».
 * С2 cents kept, not rounded: $1,839.60 is «$1,839.60», not «$1,840».
 * С3 a negative amount: «−» (U+2212) and the cents.
 * С4 the guard: no USD formatter in src drops the cents (`maximumFractionDigits: 0` / `minimumFractionDigits: 0`), and the
 *    I18n `moneyWhole` is the very `moneyText`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { docMoney } from "../src/features/docPdf";
import { moneyText } from "../src/i18n/translate";

const src = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe("money — always with cents (#2888, #2672)", () => {
  for (const [name, f] of [["moneyText (t.money, t.moneyWhole)", moneyText], ["docMoney (PDF)", docMoney]] as const) {
    it(`${name}: whole dollars keep «.00»`, () => {
      expect(f(184000)).toBe("$1,840.00");
      expect(f(0)).toBe("$0.00");
      expect(f(100)).toBe("$1.00");
      expect(f(1248000)).toBe("$12,480.00");
    });
    it(`${name}: cents are kept, never rounded to dollars`, () => {
      expect(f(183960)).toBe("$1,839.60");
      expect(f(77236)).toBe("$772.36");
      expect(f(5)).toBe("$0.05");
    });
    it(`${name}: a negative amount — «−» (U+2212) and the cents`, () => {
      expect(f(-2500)).toBe("−$25.00");
      expect(f(-1999)).toBe("−$19.99");
    });
  }

  it("the guard: no formatter in src drops the cents", () => {
    const bad = files(src).filter((p) => /(maximum|minimum)FractionDigits:\s*0\b/.test(readFileSync(p, "utf8")));
    expect(bad).toEqual([]);
  });

  // #3029/#3030 (founder 27.11: «центы — только внутри документов»): an overview's `moneyWhole` is whole dollars (moneyWhole.test.ts);
  // `money` — the documents, the editor, the fields, the PDF — keeps the cents (above)
  it("the guard: the overviews' moneyWhole is moneyWholeText; money stays moneyText (with cents)", () => {
    const i18n = readFileSync(join(src, "i18n", "index.tsx"), "utf8");
    expect(i18n).toMatch(/moneyWhole:\s*moneyWholeText,/);
    expect(i18n).toMatch(/money:\s*moneyText,/);
  });
});
