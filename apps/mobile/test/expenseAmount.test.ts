/**
 * unit:expenseAmount — #1537 (rule 8): a new expense's amount through the app's one money parser (the engine underneath).
 * The old screen did Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100): «-5» → $5, «12abc» → $12, «1.005» → $1.00,
 * «12,50» → $1,250. Each row says what the old way gave; the new way is the money fields' rule.
 */
import { describe, expect, it } from "vitest";
import { expenseAmountCents } from "../src/features/expenseAmount";
import { MAX_CENTS } from "../src/ui/numberInput";

const old = (x: string) => Math.round(Number(x.replace(/[^0-9.]/g, "")) * 100);

describe("unit:expenseAmount — #1537", () => {
  const cases: [string, number, number][] = [
    // input, the old way, the new way
    ["12", 1200, 1200],
    ["$12", 1200, 1200],
    ["12.34", 1234, 1234],
    ["1,234.50", 123450, 123450],
    ["12,50", 125000, 1250], // a decimal comma: $12.50, not $1,250
    ["-5", 500, 0], // a minus is not an amount
    ["12abc", 1200, 0], // letters are not an amount
    ["1.005", 100, 0], // more than two decimals: no amount (the old way silently lost a cent)
    ["", 0, 0],
  ];
  for (const [input, was, now] of cases)
    it(`«${input}»: the old way ${was}, now ${now}`, () => {
      expect(old(input)).toBe(was);
      expect(expenseAmountCents(input)).toBe(now);
    });
  it("above the app's money limit — no amount", () => {
    expect(expenseAmountCents("99999999999999")).toBe(0);
    expect(expenseAmountCents(String((MAX_CENTS / 100).toFixed(2)))).toBe(MAX_CENTS);
  });
});
