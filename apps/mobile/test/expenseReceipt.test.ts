/**
 * #1538: an expense's receipt goes to the cloud — its files row (kind «receipt»), the expense pointing at it, then the
 * bytes; an older op without a receipt is sent as before (rule 16); after a reload the phone keeps its receipt file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, Expense } from "../src/data/types";

const writes: { table: string; op: string; row?: Record<string, unknown> }[] = [];
const uploads: string[] = [];
const ok = { error: null, status: 201 };
const thenable = (v: unknown) => ({ then: (r: (x: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(v).then(r, j) });
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => (writes.push({ table, op: "upsert", row }), thenable(ok)),
      update: (row: Record<string, unknown>) => ({ eq: () => (writes.push({ table, op: "update", row }), thenable(ok)) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null, status: 200 }) }) }),
    }),
    storage: { from: () => ({ upload: async (key: string) => (uploads.push(key), { error: null }) }) },
  },
}));
const { applyOp } = await import("../src/cloud/ops");
const { keepReceiptLocal } = await import("../src/data/photoUpload");

beforeEach(() => {
  writes.length = 0;
  uploads.length = 0;
  vi.stubGlobal("fetch", async () => ({ blob: async () => ({ size: 200_000, type: "image/jpeg" }) }));
});

const base = { k: "expense.add" as const, id: "x1", jobId: null, vendor: "Depot", category: "materials" as const, amountCents: 4200 };

describe("expense.add — the receipt goes with the expense (#1538)", () => {
  it("with a receipt: the files row (receipt), the expense pointing at it, then the bytes", async () => {
    await applyOp({ ...base, receiptFileId: "f1", receiptUri: "file:///r.jpg" }, "c1", "u1");
    const ups = writes.filter((w) => w.op === "upsert");
    expect(ups.map((w) => w.table)).toEqual(["files", "expenses"]);
    expect(ups[0]!.row).toMatchObject({ id: "f1", company_id: "c1", kind: "receipt" });
    expect(ups[1]!.row).toMatchObject({ id: "x1", receipt_file_id: "f1" });
    expect(uploads).toEqual(["c1/f1.jpg"]);
    expect(writes.find((w) => w.op === "update")?.row).toMatchObject({ storage_key: "c1/f1.jpg", upload_status: "uploaded" });
  });
  it("an older op (no receipt fields): only the expense, as before (rule 16)", async () => {
    await applyOp(base, "c1", "u1");
    expect(writes.map((w) => w.table)).toEqual(["expenses"]);
    expect(writes[0]!.row).not.toHaveProperty("receipt_file_id");
    expect(uploads).toEqual([]);
  });
});

describe("keepReceiptLocal — a reload keeps the receipt's file on this phone", () => {
  const exp = (o: Partial<Expense>): Expense => ({ id: "x1", jobId: null, vendor: "Depot", category: "materials", amountCents: 4200, at: "2026-11-15T12:00:00Z", memberId: "u1", ...o });
  const db = (expenses: Expense[]) => ({ expenses }) as unknown as DB;
  it("the server's expense (receipt in the cloud) keeps the phone's file", () => {
    const next = keepReceiptLocal(db([exp({ receiptFileId: "f1" })]), db([exp({ receiptFileId: "f1", receiptUri: "file:///r.jpg" })]));
    expect(next.expenses![0]).toMatchObject({ receiptFileId: "f1", receiptUri: "file:///r.jpg" });
  });
  it("nothing on the phone: as the server says (the same object)", () => {
    const n = db([exp({ receiptFileId: "f1" })]);
    expect(keepReceiptLocal(n, db([exp({})]))).toBe(n);
  });
});
