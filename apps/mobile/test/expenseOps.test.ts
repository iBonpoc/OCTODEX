/**
 * #2009: an expense is fixed over the version the phone read («someone changed it first» otherwise, never a retry) and
 * removed through the Trash (trash_items: the server checks who may); who may on the phone — as the server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { what: string; args: unknown }[] = [];
const answer = { update: [{ id: "x1" }] as unknown[] | null, trash: [{ id: "x1", ok: true, reason: null }] as unknown[] };
const chain = (what: string, row: unknown) => {
  const filters: [string, unknown][] = [];
  const self = {
    eq: (k: string, v: unknown) => (filters.push([k, v]), self),
    select: async () => (calls.push({ what, args: { row, filters } }), { data: answer.update, error: null, status: 200 }),
    then: (r: (x: unknown) => unknown) => (calls.push({ what, args: { row, filters } }), Promise.resolve({ error: null, status: 204 }).then(r)),
  };
  return self;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({ update: (row: Record<string, unknown>) => chain(`${table}.update`, row) }),
    rpc: async (fn: string, args: unknown) => (calls.push({ what: `rpc.${fn}`, args }), { data: answer.trash, error: null, status: 200 }),
  },
}));
const { applyOp } = await import("../src/cloud/ops");
const { canEditExpense } = await import("../src/features/expenseForm");

beforeEach(() => {
  calls.length = 0;
  answer.update = [{ id: "x1" }];
  answer.trash = [{ id: "x1", ok: true, reason: null }];
});
const upd = { k: "expense.update" as const, id: "x1", jobId: null, vendor: "Depot", category: "fuel" as const, amountCents: 1200, date: "2026-11-16" };

describe("expense.update / expense.remove (#2009)", () => {
  it("С1: an edit writes the fields and the day, over the version read", async () => {
    await applyOp({ ...upd, baseRowVersion: 3 }, "c1", "u1");
    const c = calls.find((x) => x.what === "expenses.update")!.args as { row: Record<string, unknown>; filters: [string, unknown][] };
    expect(c.row).toMatchObject({ vendor: "Depot", category: "fuel", amount_cents: 1200, date: "2026-11-16", job_id: null });
    expect(c.filters).toContainEqual(["row_version", 3]);
    expect(c.filters).toContainEqual(["company_id", "c1"]);
  });
  it("another phone changed it first: «row_version_conflict», a permanent refusal (no retry)", async () => {
    answer.update = [];
    await expect(applyOp({ ...upd, baseRowVersion: 3 }, "c1", "u1")).rejects.toMatchObject({ hint: "row_version_conflict" });
  });
  it("an edit without a known version (an expense read before #2009): written as is", async () => {
    await applyOp(upd, "c1", "u1");
    const c = calls.find((x) => x.what === "expenses.update")!.args as { filters: [string, unknown][] };
    expect(c.filters.some(([k]) => k === "row_version")).toBe(false);
  });
  it("С2: a removal goes through the Trash; a refusal of the server is said, never retried", async () => {
    await applyOp({ k: "expense.remove", id: "x1" }, "c1", "u1");
    expect(calls).toContainEqual({ what: "rpc.trash_items", args: { p_kind: "expense", p_ids: ["x1"] } });
    answer.trash = [{ id: "x1", ok: false, reason: "noRight" }];
    await expect(applyOp({ k: "expense.remove", id: "x1" }, "c1", "u1")).rejects.toMatchObject({ hint: "noRight" });
  });
  it("who may: the owner and the office anyone's; sales and a technician only their own", () => {
    const x = { memberId: "m1" };
    expect(canEditExpense("director", "m9", x)).toBe(true);
    expect(canEditExpense("dispatcher", "m9", x)).toBe(true);
    expect(canEditExpense("sales", "m9", x)).toBe(false);
    expect(canEditExpense("tech", "m9", x)).toBe(false);
    expect(canEditExpense("tech", "m1", x)).toBe(true);
    expect(canEditExpense("sales", "m1", x)).toBe(true);
    expect(canEditExpense("tech", null, x)).toBe(false);
  });
});
