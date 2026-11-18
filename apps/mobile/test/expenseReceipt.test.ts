/**
 * #1538: an expense's receipt goes to the cloud — its files row (kind «receipt»), the expense pointing at it, then the
 * bytes; an older op without a receipt is sent as before (rule 16); after a reload the phone keeps its receipt file.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, Expense } from "../src/data/types";

const writes: { table: string; op: string; row?: Record<string, unknown> }[] = [];
const uploads: string[] = [];
const storage = { error: null as unknown };
const ok = { error: null, status: 201 };
const thenable = (v: unknown) => ({ then: (r: (x: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(v).then(r, j) });
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => (writes.push({ table, op: "upsert", row }), thenable(ok)),
      update: (row: Record<string, unknown>) => ({ eq: () => (writes.push({ table, op: "update", row }), thenable(ok)) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null, status: 200 }) }) }),
    }),
    storage: { from: () => ({ upload: async (key: string) => (uploads.push(key), { error: storage.error }) }) },
  },
}));
const { applyOp } = await import("../src/cloud/ops");
const { hasReceipt, keepReceiptLocal, markReceipt } = await import("../src/data/photoUpload");

beforeEach(() => {
  writes.length = 0;
  uploads.length = 0;
  storage.error = null;
  vi.stubGlobal("fetch", async () => ({ blob: async () => ({ size: 200_000, type: "image/jpeg" }) }));
});

const base = { k: "expense.add" as const, id: "x1", jobId: null, vendor: "Depot", category: "materials" as const, amountCents: 4200 };

describe("expense.add — the receipt goes with the expense (#1538)", () => {
  it("with a receipt: the files row (receipt), the expense pointing at it, then the bytes", async () => {
    const r = await applyOp({ ...base, receiptFileId: "f1", receiptUri: "file:///r.jpg" }, "c1", "u1");
    expect(r).toEqual({ receipt: { expenseId: "x1", failed: null } });
    const ups = writes.filter((w) => w.op === "upsert");
    expect(ups.map((w) => w.table)).toEqual(["files", "expenses"]);
    expect(ups[0]!.row).toMatchObject({ id: "f1", company_id: "c1", kind: "receipt" });
    expect(ups[1]!.row).toMatchObject({ id: "x1", receipt_file_id: "f1" });
    expect(uploads).toEqual(["c1/f1.jpg"]);
    expect(writes.find((w) => w.op === "update")?.row).toMatchObject({ storage_key: "c1/f1.jpg", upload_status: "uploaded" });
  });
  it("a repeat of the same op (an answer lost): the same rows again (the server ignores doubles), the bytes again", async () => {
    const op = { ...base, receiptFileId: "f1", receiptUri: "file:///r.jpg" };
    await applyOp(op, "c1", "u1");
    await applyOp(op, "c1", "u1");
    expect(writes.filter((w) => w.op === "upsert").map((w) => [w.table, w.row?.id])).toEqual([["files", "f1"], ["expenses", "x1"], ["files", "f1"], ["expenses", "x1"]]);
  });
  it("the storage refuses the receipt: the expense is kept, the phone is told why", async () => {
    storage.error = Object.assign(new Error("new row violates row-level security policy"), { name: "StorageApiError", status: 403, statusCode: "403" });
    const r = await applyOp({ ...base, receiptFileId: "f1", receiptUri: "file:///r.jpg" }, "c1", "u1");
    expect(r).toEqual({ receipt: { expenseId: "x1", failed: "refused" } });
    expect(writes.filter((w) => w.op === "upsert").map((w) => w.table)).toEqual(["files", "expenses"]);
  });
  it("the receipt's file is gone from the phone (a dead web blob after a reload): «gone», nothing sent", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    const r = await applyOp({ ...base, receiptFileId: "f1", receiptUri: "blob:http://x/dead" }, "c1", "u1");
    expect(r).toEqual({ receipt: { expenseId: "x1", failed: "gone" } });
    expect(uploads).toEqual([]);
  });
  it("an older op (no receipt fields): only the expense, as before (rule 16)", async () => {
    await applyOp(base, "c1", "u1");
    expect(writes.map((w) => w.table)).toEqual(["expenses"]);
    expect(writes[0]!.row).not.toHaveProperty("receipt_file_id");
    expect(uploads).toEqual([]);
  });
  it("#2008 С3: the receipt's day goes with the expense; an older op without one leaves the server's today; junk is not sent", async () => {
    await applyOp({ ...base, date: "2026-11-16" }, "c1", "u1");
    expect(writes[0]!.row).toMatchObject({ id: "x1", date: "2026-11-16" });
    writes.length = 0;
    await applyOp(base, "c1", "u1");
    expect(writes[0]!.row).not.toHaveProperty("date");
    writes.length = 0;
    await applyOp({ ...base, date: "16.11.2026" }, "c1", "u1");
    expect(writes[0]!.row).not.toHaveProperty("date");
  });
});

describe("keepReceiptLocal — a reload keeps the receipt's file on this phone", () => {
  const exp = (o: Partial<Expense>): Expense => ({ id: "x1", jobId: null, vendor: "Depot", category: "materials", amountCents: 4200, at: "2026-11-15T12:00:00Z", memberId: "u1", ...o });
  const db = (expenses: Expense[]) => ({ expenses }) as unknown as DB;
  it("the server's expense (receipt in the cloud) keeps the phone's file", () => {
    const next = keepReceiptLocal(db([exp({ receiptFileId: "f1" })]), db([exp({ receiptFileId: "f1", receiptUri: "file:///r.jpg" })]));
    expect(next.expenses![0]).toMatchObject({ receiptFileId: "f1", receiptUri: "file:///r.jpg" });
  });
  it("the server's «failed» keeps the phone's own reason; the server took it — the mark goes", () => {
    const prev = db([exp({ receiptFileId: "f1", receiptUri: "file:///r.jpg", receiptFailed: "tooBig" })]);
    expect(keepReceiptLocal(db([exp({ receiptFileId: "f1", receiptFailed: "refused" })]), prev).expenses![0]!.receiptFailed).toBe("tooBig");
    expect(keepReceiptLocal(db([exp({ receiptFileId: "f1" })]), prev).expenses![0]!.receiptFailed).toBeUndefined();
  });
  it("still on its way (the server's row not taken yet): the phone keeps its receipt's id and file", () => {
    const next = keepReceiptLocal(db([exp({})]), db([exp({ receiptFileId: "f1", receiptUri: "file:///r.jpg" })]));
    expect(next.expenses![0]).toMatchObject({ receiptFileId: "f1", receiptUri: "file:///r.jpg" });
  });
  it("nothing on the phone: as the server says (the same object)", () => {
    const n = db([exp({ receiptFileId: "f1" })]);
    expect(keepReceiptLocal(n, db([exp({})]))).toBe(n);
  });
});

describe("markReceipt / hasReceipt — what the card says", () => {
  const exp = (o: Partial<Expense>): Expense => ({ id: "x1", jobId: null, vendor: "Depot", category: "materials", amountCents: 4200, at: "2026-11-15T12:00:00Z", memberId: "u1", ...o });
  it("refused: marked with why, not «есть чек»; taken: the mark goes, «есть чек»", () => {
    const d0 = { expenses: [exp({ receiptFileId: "f1", receiptUri: "file:///r.jpg" })] } as unknown as DB;
    const d1 = markReceipt(d0, "x1", "refused");
    expect(d1.expenses![0]!.receiptFailed).toBe("refused");
    expect(hasReceipt(d1.expenses![0]!)).toBe(false);
    const d2 = markReceipt(d1, "x1", null);
    expect(d2.expenses![0]!.receiptFailed).toBeUndefined();
    expect(hasReceipt(d2.expenses![0]!)).toBe(true);
    expect(markReceipt(d2, "x1", null)).toBe(d2);
    expect(markReceipt(d2, "nope", "refused")).toBe(d2);
  });
  it("no receipt at all: «Без чека»", () => expect(hasReceipt(exp({}))).toBe(false));
});
