/**
 * Overdue sign on the client list card (founder 07.11): «Просрочено $1,400 · 12 дн» — the unpaid rest of every
 * overdue invoice and the oldest one; paid, not-yet-due and other clients' invoices do not count.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addDays } from "../src/features/calendar";
import { clientOverdueOf } from "@/features/clients";
import type { Invoice } from "@/data/types";

const NOW = new Date("2026-11-05T15:00:00-08:00").getTime(); // 3 PM in Los Angeles (the demo company)
const TZ = "America/Los_Angeles";
const day = (offset: number) => addDays("2026-11-05", offset);
let n = 0;
const inv = (customerId: string, totalCents: number, paidCents: number, due: number): Invoice =>
  ({ id: `i${++n}`, customerId, jobId: "j", totalCents, paidCents, dueDate: day(due) }) as Invoice;

describe("clientOverdueOf", () => {
  it("5 invoices: paid, partly paid not due, two overdue, another client — sum of overdue rests, the oldest days", () => {
    const db = {
      invoices: [
        inv("c1", 100_000, 100_000, -30), // paid in full: not overdue
        inv("c1", 150_000, 50_000, 7), // partly paid, due in a week: owed, not overdue
        inv("c1", 80_000, 0, -12), // overdue 12 days
        inv("c1", 60_000, 20_000, -3), // partly paid, overdue 3 days: the rest $400
        inv("c2", 99_900, 0, -40), // another client
      ],
    };
    expect(clientOverdueOf(db, "c1", NOW, TZ)).toEqual({ cents: 120_000, days: 12 });
  });
  it("nothing overdue → no sign (due today / tomorrow is a warning of the invoice, not an overdue)", () => {
    const db = { invoices: [inv("c1", 50_000, 0, 0), inv("c1", 50_000, 0, 1), inv("c1", 50_000, 50_000, -5)] };
    expect(clientOverdueOf(db, "c1", NOW, TZ)).toBeNull();
  });
  it("the list card takes the sign from clientOverdueOf (one rule)", () => {
    const src = readFileSync(join(__dirname, "../src/app/(tabs)/clients.tsx"), "utf8");
    expect(src).toMatch(/clientOverdueOf\(/);
    expect(src).toMatch(/fix\.client\.overdue/);
  });
});
