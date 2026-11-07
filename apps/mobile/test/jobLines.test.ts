/**
 * 3b-2 (17-job §11.1): own lines of a job without an estimate — totals by the engine (the same as the server, db T41),
 * refusals before the store (an estimate's job, a done job, below what is invoiced — db T69), the CA warning.
 * Test prices.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { caContractWarning, jobClientExempt, lineChangeRefusal, lineSaveUndo, linesEditable, linesOf, nextLinePosition, percentToBps, taxBefore, withJobLine, withJobTax, withoutJobLine } from "../src/features/jobLines";
import type { DB, JobLineItem } from "../src/data/types";

const line = (x: Partial<JobLineItem> & { id: string; jobId: string }): Omit<JobLineItem, "totalCents"> => ({
  position: 0, name: "Labor", quantity: "1", unitPriceCents: 10_000, taxable: false, ...x,
});

describe("job lines in the app", () => {
  it("adding lines recounts the job total and the line totals (engine, half up)", () => {
    let d: DB = makeSeed();
    d = withJobLine(d, line({ id: "l1", jobId: "j3", quantity: "2.5", unitPriceCents: 1999, taxable: true }));
    d = withJobLine(d, line({ id: "l2", jobId: "j3", position: 1, quantity: "3", unitPriceCents: 4500 }));
    expect(linesOf(d, "j3").map((l) => l.totalCents)).toEqual([4998, 13500]);
    expect(d.jobs.find((j) => j.id === "j3")!.amountCents).toBe(18_498);
    expect(nextLinePosition(d, "j3")).toBe(2);
    // tax 10.25% on the taxable line only: 4998 × 0.1025 = 512.3 → 512
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 1025 });
    expect(d.jobs.find((j) => j.id === "j3")!.amountCents).toBe(19_010);
  });
  it("editing and removing a line follow", () => {
    let d: DB = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3" }));
    d = withJobLine(d, line({ id: "l1", jobId: "j3", quantity: "4" }));
    expect(linesOf(d, "j3")).toHaveLength(1);
    expect(d.jobs.find((j) => j.id === "j3")!.amountCents).toBe(40_000);
    d = withoutJobLine(d, "l1");
    expect(linesOf(d, "j3")).toHaveLength(0);
    expect(d.jobs.find((j) => j.id === "j3")!.amountCents).toBe(0);
  });
  it("a job from an estimate keeps its total and refuses own lines", () => {
    const d0 = makeSeed();
    const j1 = d0.jobs.find((j) => j.id === "j1")!;
    expect(linesEditable(j1)).toBe(false);
    const d1 = withJobLine(d0, line({ id: "l1", jobId: "j1" }));
    expect(d1.jobs.find((j) => j.id === "j1")!.amountCents).toBe(j1.amountCents);
    expect(lineChangeRefusal(d0, d1, "j1")).toBe("estimate");
  });
  it("a done job refuses", () => {
    const d0 = makeSeed();
    d0.jobs = d0.jobs.map((j) => (j.id === "j3" ? { ...j, status: "done" as const } : j));
    expect(lineChangeRefusal(d0, withJobLine(d0, line({ id: "l1", jobId: "j3" })), "j3")).toBe("done");
  });
  it("below what is invoiced — refused; down to it — fine (db T69)", () => {
    let d0: DB = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3", quantity: "5" }));
    d0 = { ...d0, invoices: [...d0.invoices, { ...d0.invoices[0]!, id: "i-t", jobId: "j3", totalCents: 30_000, paidCents: 0 }] };
    expect(lineChangeRefusal(d0, withJobLine(d0, line({ id: "l1", jobId: "j3", quantity: "2" })), "j3")).toBe("belowInvoiced");
    expect(lineChangeRefusal(d0, withoutJobLine(d0, "l1"), "j3")).toBe("belowInvoiced");
    expect(lineChangeRefusal(d0, withJobLine(d0, line({ id: "l1", jobId: "j3", quantity: "3" })), "j3")).toBeNull();
    expect(lineChangeRefusal(d0, withJobLine(d0, line({ id: "l2", jobId: "j3", position: 1 })), "j3")).toBeNull();
  });
  it("CA warning: over $500 on a home without an estimate; not commercial; not elsewhere", () => {
    let d: DB = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3", quantity: "3", unitPriceCents: 16_667 }));
    expect(d.company?.address.state).toBe("CA");
    expect(caContractWarning(d, "j3")).toBe(true);
    const at500 = withJobLine(d, line({ id: "l1", jobId: "j3", quantity: "5", unitPriceCents: 10_000 }));
    expect(caContractWarning(at500, "j3")).toBe(false);
    const commercial = { ...d, properties: d.properties.map((p) => (p.id === "p3" ? { ...p, kind: "commercial" as const } : p)) };
    expect(caContractWarning(commercial, "j3")).toBe(false);
    const nv = { ...d, company: { ...d.company!, address: { ...d.company!.address, state: "NV" } } };
    expect(caContractWarning(nv, "j3")).toBe(false);
    // no own lines (a job from an estimate, or not filled yet) — no warning
    d = withoutJobLine(d, "l1");
    expect(caContractWarning(d, "j3")).toBe(false);
  });
  it("an exempt client: no tax on the job, the total and the CA check use the untaxed total (server t18)", () => {
    let d: DB = makeSeed();
    d.customers = d.customers.map((c) => (c.id === "c3" ? { ...c, taxExempt: true } : c));
    expect(jobClientExempt(d, d.jobs.find((j) => j.id === "j3")!)).toBe(true);
    d = withJobLine(d, line({ id: "l1", jobId: "j3", quantity: "5", unitPriceCents: 10_000, taxable: true }));
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 1000 });
    const j = d.jobs.find((x) => x.id === "j3")!;
    expect(j.taxEnabled).toBe(false);
    expect(j.amountCents).toBe(50_000);
    // with tax it would be $550 and warned; exempt it is exactly $500.00 — not over
    expect(caContractWarning(d, "j3")).toBe(false);
  });
  it("percentToBps: a typed rate, never a throw", () => {
    expect(percentToBps("8.25")).toBe(825);
    expect(percentToBps(" 10 %")).toBe(1000);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("100")).toBe(10_000);
    for (const bad of ["7..5", "1.2.3", "", ".", "abc", "101", "-1", "8.25.1"]) expect(percentToBps(bad)).toBeNull();
  });
  it("«Отменить» is a step back: a new line → remove, an edit → the old line; the tax before", () => {
    const d0 = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3", quantity: "2" }));
    expect(lineSaveUndo(d0, { id: "l-new" })).toEqual({ k: "remove", id: "l-new" });
    const back = lineSaveUndo(d0, { id: "l1" });
    expect(back).toEqual({ k: "save", line: expect.objectContaining({ id: "l1", quantity: "2", unitPriceCents: 10_000 }) });
    expect("totalCents" in (back as { line: object }).line).toBe(false);
    const d1 = withJobTax(d0, "j3", { taxEnabled: true, taxRateBps: 825 });
    expect(taxBefore(d0, "j3")).toEqual({ taxEnabled: false, taxRateBps: 0 });
    expect(taxBefore(d1, "j3")).toEqual({ taxEnabled: true, taxRateBps: 825 });
  });
  it("«Без налога» set later does not change the job's tax snapshot: a rename keeps $550, no false refusal (server t18)", () => {
    let d: DB = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3", quantity: "5", unitPriceCents: 10_000, taxable: true }));
    d = withJobTax(d, "j3", { taxEnabled: true, taxRateBps: 1000 });
    expect(d.jobs.find((j) => j.id === "j3")!.amountCents).toBe(55_000);
    d = { ...d, invoices: [...d.invoices, { ...d.invoices[0]!, id: "i-t", jobId: "j3", totalCents: 55_000, paidCents: 0 }] };
    d = { ...d, customers: d.customers.map((c) => (c.id === "c3" ? { ...c, taxExempt: true } : c)) };
    const renamed = withJobLine(d, line({ id: "l1", jobId: "j3", name: "Labor (renamed)", quantity: "5", unitPriceCents: 10_000, taxable: true }));
    expect(renamed.jobs.find((j) => j.id === "j3")!.amountCents).toBe(55_000);
    expect(lineChangeRefusal(d, renamed, "j3")).toBeNull();
    // the CA check uses the same $550
    expect(caContractWarning(renamed, "j3")).toBe(true);
    // switching the tax on again for an exempt client: stays off (the moment the tax is set)
    const off = withJobTax(withJobTax(d, "j3", { taxEnabled: false, taxRateBps: 1000 }), "j3", { taxEnabled: true, taxRateBps: 1000 });
    expect(off.jobs.find((j) => j.id === "j3")!.taxEnabled).toBe(false);
  });
  it("«Отменить» after an invoice went out is refused by the same check (store undo, server t19)", () => {
    const d0 = withJobLine(makeSeed(), line({ id: "l1", jobId: "j3", quantity: "4" })); // $400
    const back = lineSaveUndo(d0, { id: "l1" });
    let d1 = withJobLine(d0, line({ id: "l1", jobId: "j3", quantity: "8" })); // $800
    d1 = { ...d1, invoices: [...d1.invoices, { ...d1.invoices[0]!, id: "i-t", jobId: "j3", totalCents: 80_000, paidCents: 0 }] };
    expect(back.k).toBe("save");
    const undone = withJobLine(d1, (back as { line: Omit<JobLineItem, "totalCents"> }).line);
    expect(lineChangeRefusal(d1, undone, "j3")).toBe("belowInvoiced");
    // the tax back off: refused when an $880 invoice is out, fine when only $800 is
    const taxed = withJobTax(d1, "j3", { taxEnabled: true, taxRateBps: 1000 });
    expect(taxed.jobs.find((j) => j.id === "j3")!.amountCents).toBe(80_000); // the line is not taxable
    const taxedLine = withJobLine(taxed, line({ id: "l1", jobId: "j3", quantity: "8", taxable: true }));
    const out880 = { ...taxedLine, invoices: taxedLine.invoices.map((i) => (i.id === "i-t" ? { ...i, totalCents: 88_000 } : i)) };
    expect(lineChangeRefusal(out880, withJobTax(out880, "j3", taxBefore(d1, "j3")), "j3")).toBe("belowInvoiced");
    expect(lineChangeRefusal(taxedLine, withJobTax(taxedLine, "j3", taxBefore(d1, "j3")), "j3")).toBeNull();
  });
});
