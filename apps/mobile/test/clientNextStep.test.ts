/** The client card's one main button — the next step along the chain (redesign 20.11.2026, features/client/nextStep.ts). */
import { describe, expect, it } from "vitest";
import type { Estimate, Invoice, Job } from "../src/data/types";
import { clientCurrent, clientNextStep } from "../src/features/client/nextStep";

const est = (id: string, status: Estimate["status"], o: Partial<Estimate> = {}): Estimate =>
  ({ id, status, customerId: "c", propertyId: "p", title: id, totalCents: 100_000, ...o }) as Estimate;
const job = (id: string, o: Partial<Job> = {}): Job => ({ id, propertyId: "p", title: id, status: "scheduled", amountCents: 100_000, ...o }) as Job;
const inv = (id: string, o: Partial<Invoice> = {}): Invoice => ({ id, customerId: "c", jobId: "j1", totalCents: 50_000, paidCents: 0, dueDate: "2026-12-01", ...o }) as Invoice;
const base = { estimates: [] as Estimate[], jobs: [] as Job[], invoices: [] as Invoice[], role: "director" as const, newEstimateHref: "/estimate/new?customerId=c" };

describe("the next step along the chain", () => {
  it("no estimate → «Новая смета» (the «＋» address of this client)", () => expect(clientNextStep(base)).toEqual({ kind: "estimate", href: base.newEstimateHref }));
  it("no right to a new estimate (do not service) and nothing else → no button", () => expect(clientNextStep({ ...base, newEstimateHref: undefined })).toBeNull());
  it("a draft → «Отправить»: the estimate opens with its send sheet", () => {
    const s = clientNextStep({ ...base, estimates: [est("e1", "draft")] });
    expect(s).toMatchObject({ kind: "send", href: "/estimate/e1?send=1" });
  });
  it("approved with something left to bill → «Выставить счёт» on the job's statement", () => {
    const s = clientNextStep({ ...base, estimates: [est("e1", "approved")], jobs: [job("j1", { estimateId: "e1" })], invoices: [inv("i1", { totalCents: 30_000, paidCents: 30_000 })] });
    expect(s).toMatchObject({ kind: "bill", href: "/job/j1", toInvoiceCents: 70_000 });
  });
  it("approved and billed in full and paid → back to «Новая смета»", () => {
    const s = clientNextStep({ ...base, estimates: [est("e1", "approved")], jobs: [job("j1", { estimateId: "e1" })], invoices: [inv("i1", { totalCents: 100_000, paidCents: 100_000 })] });
    expect(s?.kind).toBe("estimate");
  });
  it("an invoice not paid → «Взять оплату» first, ahead of a draft; the earliest due one", () => {
    const s = clientNextStep({ ...base, estimates: [est("e2", "draft")], invoices: [inv("late", { dueDate: "2026-12-20" }), inv("soon", { dueDate: "2026-11-01", paidCents: 10_000 })] });
    expect(s).toMatchObject({ kind: "pay", href: "/invoice/soon", owesCents: 40_000 });
  });
  it("a void invoice asks for nothing", () => expect(clientNextStep({ ...base, invoices: [inv("v", { status: "void" })] })?.kind).toBe("estimate"));
  it("sales cannot take a hand-made invoice's payment (paymentRight) and cannot bill (canBill)", () => {
    const s = clientNextStep({ ...base, role: "sales", estimates: [est("e1", "approved")], jobs: [job("j1", { estimateId: "e1" })], invoices: [inv("i1", { kind: "final" })] });
    expect(s?.kind).toBe("estimate");
  });
});

describe("«Сейчас»", () => {
  it("the document of the step, and the jobs not done", () => {
    const s = clientNextStep({ ...base, estimates: [est("e1", "draft")] });
    const now = clientCurrent(s, [est("e1", "draft")], [job("a"), job("b", { status: "done" })]);
    expect(now.doc).toMatchObject({ type: "estimate", e: { id: "e1" } });
    expect(now.jobs.map((j) => j.id)).toEqual(["a"]);
  });
  it("no step document — the estimate waiting for the client's answer", () => {
    const list = [est("e1", "declined"), est("e2", "sent")];
    expect(clientCurrent({ kind: "estimate", href: "x" }, list, []).doc).toMatchObject({ e: { id: "e2" } });
  });
});
