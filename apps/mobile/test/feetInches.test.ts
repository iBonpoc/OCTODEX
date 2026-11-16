/**
 * Lengths in feet in the client's documents (#1733; founder 11.11, G-15: «как на чертеже, без округления; допустимо до
 * 1/16″»): a line in «ft» reads «40′ 5″», not «40.42 ft» — on the /p/ page, in the PDF and the estimate shown to the client.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { feetInches, shownQtyUnit } from "@/features/estimateDoc";

describe("feetInches — feet as the drawing writes them, to 1/16″", () => {
  it.each([
    [40.4167, "40′ 5″"],
    [19.1667, "19′ 2″"],
    [12, "12′"],
    [0.75, "9″"],
    [0, "0″"],
    [8 + 9.25 / 12, "8′ 9¼″"],
    [8 + (9 + 3 / 16) / 12, "8′ 9 3/16″"],
    [5 / 192, "5/16″"],
    [11.99999, "12′"],
  ])("%s ft → %s", (ft, want) => expect(feetInches(ft)).toBe(want));
});

describe("shownQtyUnit — the quantity with its unit for the client", () => {
  it("ft: feet-inches, no «ft»", () => {
    expect(shownQtyUnit("40.4167", "ft")).toBe("40′ 5″");
    expect(shownQtyUnit(19.1667, "ft")).toBe("19′ 2″");
  });
  it("other units as before: the number and the unit", () => {
    expect(shownQtyUnit("3", "ea")).toBe("3 ea");
    expect(shownQtyUnit("40.4167", "LF")).toBe("40.4167 LF");
    expect(shownQtyUnit("2.50", "hr")).toBe("2.5 hr");
  });
  it("a quantity that is not a number is shown as typed", () => {
    expect(shownQtyUnit("abc", "ft")).toBe("abc ft");
  });
  it("the client's page and the PDF take it (one rule)", () => {
    for (const f of ["EstimateView.tsx", "estimatePdf.ts"]) {
      const src = readFileSync(join(__dirname, "../src/features", f), "utf8");
      expect(src, f).toMatch(/shownQtyUnit\(l\.quantity, l\.unit\)/);
      expect(src, f).toMatch(/isFeetUnit\(l\.unit\)/);
      expect(src, f).not.toMatch(/shownQty\(l\.quantity\)\}? \$?\{?l\.unit/);
    }
  });
});
