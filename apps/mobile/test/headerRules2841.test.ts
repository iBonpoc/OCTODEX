/**
 * DS §12.13 «Шапка» (#2841, founder 26.11: one header on every screen). The header's word rules, pure:
 * - «‹» says the parent's title; one longer than BACK_MAX letters is said by its kind word, never cut with «…»;
 * - a list's big title is its menu word, no number (the number is in the chip «Все N»).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACK_MAX, backLabel } from "../src/ui/templates/templateRules";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("#2841 the back label", () => {
  it("a short parent title stays as it is", () => {
    expect(backLabel("Sarah Mitchell", "/client/c1")).toEqual({ label: "Sarah Mitchell" });
    expect(backLabel("Клиенты", "/clients")).toEqual({ label: "Клиенты" });
  });
  it("a long one becomes the parent's kind word, by the parent's address", () => {
    const long = "Bathroom remodel: vanity, toilet, tile";
    expect(long.length).toBeGreaterThan(BACK_MAX);
    expect(backLabel(long, "/job/j1")).toEqual({ kind: "job" });
    expect(backLabel(long, "/estimate/e5")).toEqual({ kind: "estimate" });
    expect(backLabel(long, "/invoice/i5")).toEqual({ kind: "invoice" });
    expect(backLabel(long, "/client/c1")).toEqual({ kind: "client" });
  });
  it("an unknown parent keeps its label (no wrong word)", () => {
    expect(backLabel("A very long name of something else", "/company/profile")).toEqual({ label: "A very long name of something else" });
  });
});

describe("#2841 titles", () => {
  it("a list title has no number", () => {
    const s = read("src/ui/templates/ListScreen.tsx");
    expect(s).toMatch(/const title = p\.title;/);
    expect(s).not.toMatch(/count\?: number/);
  });
  it("a document is named by its kind and number (#2843 (а))", () => {
    expect(read("src/features/invoice/InvoiceCard.tsx")).toMatch(/title: `\$\{t\("inv\.title"\)\} \$\{number\}`/);
    expect(read("src/features/EstimateCard.tsx")).toMatch(/t\("est\.detail"\)\} \$\{e\.number\}/);
    expect(read("src/app/receipt/[id].tsx")).toMatch(/t\("rcpt\.title"\)\} \$\{p\.receiptNumber\}/);
  });
  it("no word button in a header: «＋» is a round HeaderButton", () => {
    for (const f of ["src/app/catalog/index.tsx", "src/app/team.tsx", "src/app/purchase-orders/index.tsx", "src/app/money.tsx", "src/app/suppliers/index.tsx"]) {
      const s = read(f);
      expect(s, f).toMatch(/right=\{[^}]*<HeaderButton icon="plus"/s);
      expect(s, f).not.toMatch(/right=\{[^\n]*<Button label=/);
    }
  });
});
