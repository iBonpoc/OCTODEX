import { describe, expect, it } from "vitest";
import type { Company } from "@/data/types";
import { firstWords, termsLangsShown, termsShown, termsToWrite } from "@/features/estimate/notesTerms";

// «Notes — заметка», «Terms — условия» (DS §8.12, spec 40 §6, #1304)
const co = (byLang: Partial<Record<"en" | "es" | "ru", string>>, terms?: string): Pick<Company, "estimate"> => ({ estimate: { validDays: 7, depositBps: 1000, termsByLang: byLang, ...(terms !== undefined ? { terms } : {}) } as Company["estimate"] });

describe("the row's words", () => {
  it("nothing written — null («Не заполнено»); blank lines skipped; the first line only", () => {
    expect(firstWords(undefined)).toBeNull();
    expect(firstWords("  \n \n")).toBeNull();
    expect(firstWords("\n  Warranty 1 year\nCleanup daily")).toBe("Warranty 1 year");
  });
  it("a long line is cut at a word with «…», never in the middle of an emoji", () => {
    const long = "Warranty covers labor for one year from completion and materials as per manufacturer terms";
    const w = firstWords(long, 40)!;
    expect(w.endsWith("…")).toBe(true);
    expect(Array.from(w).length).toBeLessThanOrEqual(41);
    expect(long.startsWith(w.slice(0, -1))).toBe(true);
    expect(firstWords("😀".repeat(50), 10)).toBe(`${"😀".repeat(10)}…`);
  });
});

describe("Terms of an estimate made before #1304 (no key): as before", () => {
  const c = co({ en: "Net 15", es: "Neto 15" });
  it("the row shows what its client reads — the company's default in their language; it is not the estimate's own", () => {
    expect(termsShown({}, c, "es")).toEqual({ text: "Neto 15", own: false });
    expect(termsShown({ terms: "Mine" }, c, "es")).toEqual({ text: "Mine", own: true });
    expect(termsShown({ terms: "" }, c, "es")).toEqual({ text: "", own: true });
  });
  it("opened and closed unchanged: no key is written (the client goes on reading the default)", () => {
    expect(termsToWrite({}, "Neto 15", "Neto 15")).toBeNull();
  });
  it("changed: the estimate gets its own text; cleared on purpose: \"\"", () => {
    expect(termsToWrite({}, "Neto 15", "Neto 30")).toBe("Neto 30");
    expect(termsToWrite({}, "Neto 15", "")).toBe("");
  });
  it("an estimate with its own text: written only when changed", () => {
    expect(termsToWrite({ terms: "Mine" }, "Mine", "Mine")).toBeNull();
    expect(termsToWrite({ terms: "Mine" }, "Mine", "Yours")).toBe("Yours");
  });
});

describe("the company's Terms by language", () => {
  it("English always; the others once written or added", () => {
    expect(termsLangsShown({ termsByLang: {} }, [])).toEqual(["en"]);
    expect(termsLangsShown({ termsByLang: { ru: "Условия" } }, [])).toEqual(["en", "ru"]);
    expect(termsLangsShown({ termsByLang: {} }, ["es"])).toEqual(["en", "es"]);
  });
});
