/**
 * 3b-2 (17-job §11.1): own lines of a job without an estimate — totals by the engine (the same as the server, db T41),
 * refusals before the store (an estimate's job, a done job, below what is invoiced — db T69), the CA warning.
 * Test prices.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { caContractWarning, lineChangeRefusal, linesEditable, linesOf, nextLinePosition, withJobLine, withJobTax, withoutJobLine } from "../src/features/jobLines";
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
});
