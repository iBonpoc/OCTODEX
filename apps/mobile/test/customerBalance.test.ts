/** #1898: the client's debt is the sum of what each invoice owes (the engine's invoicesOwe) — an overpaid invoice takes nothing off another. */
import { describe, expect, it } from "vitest";
import { customerBalance } from "../src/data/selectors";
import type { DB } from "../src/data/types";

const inv = (id: string, customerId: string, totalCents: number, paidCents: number) => ({ id, customerId, totalCents, paidCents });

describe("customerBalance (#1898)", () => {
  const db = { invoices: [inv("a", "c1", 24000, 29000), inv("b", "c1", 34200, 10000), inv("c", "c2", 5000, 0)] } as unknown as DB;
  it("an overpaid invoice owes 0 and does not reduce the other one", () => {
    expect(customerBalance(db, "c1")).toBe(24200);
  });
  it("only the client's own invoices, and 0 for a client with none", () => {
    expect(customerBalance(db, "c2")).toBe(5000);
    expect(customerBalance(db, "nobody")).toBe(0);
  });
});
