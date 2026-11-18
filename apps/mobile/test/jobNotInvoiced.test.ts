import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { makeSeed } from "../src/data/seed";
import type { DB, Invoice, Job } from "../src/data/types";

// #2048: a done job with part of its contract not on any invoice is a reason for the office — the money is not lost
const withJob = (patch: Partial<Job>, invoices: Partial<Invoice>[]): { db: DB; id: string } => {
  const db = makeSeed();
  const base = db.jobs[0]!;
  const job = { ...base, id: "j2048", status: "done", amountCents: 50000, ...patch } as Job;
  const cust = db.invoices[0]!.customerId;
  db.jobs = [...db.jobs, job];
  db.invoices = [
    ...db.invoices,
    ...invoices.map((x, n) => ({ id: `i2048-${n}`, customerId: cust, jobId: job.id, totalCents: 0, paidCents: 0, dueDate: new Date().toISOString(), kind: "final", ...x }) as Invoice),
  ];
  return { db, id: job.id };
};
const reason = (db: DB, id: string, role: Parameters<typeof buildAttention>[1] = "director") =>
  buildAttention(db, role).find((i) => i.kind === "jobNotInvoiced" && i.refId === id);

describe("«работа выполнена, счёта нет» (#2048)", () => {
  it("С1 a done job with no invoice: a reason with the whole contract", () => {
    const { db, id } = withJob({}, []);
    const r = reason(db, id);
    expect(r?.amountCents).toBe(50000);
    expect(r?.status).toBe("warn");
  });
  it("С2 a deposit only: the rest of the contract (the engine's toInvoice)", () => {
    const { db, id } = withJob({}, [{ kind: "deposit", totalCents: 15000, paidCents: 15000 }]);
    expect(reason(db, id)?.amountCents).toBe(35000);
  });
  it("С3 an invoice for the whole contract: no reason (paid or not — owing is «overdue»'s job)", () => {
    expect(reason(withJob({}, [{ totalCents: 50000, paidCents: 0 }]).db, "j2048")).toBeUndefined();
    expect(reason(withJob({}, [{ totalCents: 50000, paidCents: 50000 }]).db, "j2048")).toBeUndefined();
  });
  it("a void invoice does not count", () => {
    expect(reason(withJob({}, [{ totalCents: 50000, paidCents: 0, void: true }]).db, "j2048")?.amountCents).toBe(50000);
  });
  it("not done, or a job of $0: no reason", () => {
    expect(reason(withJob({ status: "in_progress" }, []).db, "j2048")).toBeUndefined();
    expect(reason(withJob({ amountCents: 0 }, []).db, "j2048")).toBeUndefined();
  });
  it("the office only: director and dispatcher, not the tech or sales", () => {
    const { db, id } = withJob({}, []);
    expect(reason(db, id, "dispatcher")).toBeDefined();
    expect(reason(db, id, "tech")).toBeUndefined();
    expect(reason(db, id, "sales")).toBeUndefined();
  });
});
