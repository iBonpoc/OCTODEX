/** A-19 (#784): an op this build does not know is never «sent» — applyOp throws, so the outbox keeps it. */
import { describe, expect, it, vi } from "vitest";

const touched: string[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: new Proxy({}, { get: (_t, name) => (touched.push(String(name)), () => ({})) }),
}));
import { applyOp, type Op } from "../src/cloud/ops";
import { UNKNOWN_OP } from "../src/data/outboxRetry";

describe("unit:applyOp — an unknown op (A-19)", () => {
  it("throws and sends nothing", async () => {
    const op = { k: "from.a.newer.build", id: "x" } as unknown as Op;
    await expect(applyOp(op, "c1", "u1")).rejects.toThrow(/unknown op: from\.a\.newer\.build/);
    await expect(applyOp(op, "c1", "u1")).rejects.toMatchObject({ name: UNKNOWN_OP });
    expect(touched).toEqual([]);
  });
});
