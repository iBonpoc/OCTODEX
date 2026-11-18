/**
 * #2075 (roles decision В9; audit of roles #2064): only the office bills and sets the money of a job. The director and the
 * dispatcher issue invoices and change the lines and the tax of a job; sales and the tech do neither. The screens take
 * the rule from billRights (not from a role check of their own); the server refuses the same — db T414–T416.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canBill, canEditJobMoney } from "@/features/billRights";

const src = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");

describe("billRights — the money of a contract is the office's", () => {
  it("the director and the dispatcher bill; sales and the tech do not", () => {
    expect(canBill("director")).toBe(true);
    expect(canBill("dispatcher")).toBe(true);
    expect(canBill("sales")).toBe(false);
    expect(canBill("tech")).toBe(false);
  });
  it("the lines and the tax of a job: the same people", () => {
    for (const r of ["director", "dispatcher", "sales", "tech"] as const) expect(canEditJobMoney(r)).toBe(canBill(r));
  });
  it("the statement shows its invoice buttons only by canBill", () => {
    const s = src("features/ContractStatement.tsx");
    expect(s).toMatch(/st\.toInvoice > 0 && canBill\(store\.role\) \?/);
  });
  it("the job lines open for editing only by canEditJobMoney", () => {
    const s = src("features/JobLinesBlock.tsx");
    expect(s).toMatch(/const editable = linesEditable\(job\) && canEditJobMoney\(store\.role\);/);
  });
});
