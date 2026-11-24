import { describe, expect, it } from "vitest";
import { invoiceNext } from "@/features/invoice/invoiceNext";

// #1495: the line «what now and what next» of an invoice card — every branch, on the company's calendar days (LA)
const TZ = "America/Los_Angeles";
const NOON = Date.UTC(2026, 10, 15, 20, 0, 0); // 12:00 in LA, 15 Nov 2026
const day = (n: number) => new Date(NOON - n * 86400000).toISOString();
const base = { totalCents: 10000, paidCents: 0 };

describe("invoiceNext", () => {
  it("paid in full", () => expect(invoiceNext({ ...base, paidCents: 10000, dueDate: day(3), sentAt: day(5) }, undefined, "x", NOON, TZ)).toEqual({ key: "inv.next.paid" }));
  it("overdue, never reminded", () => expect(invoiceNext({ ...base, dueDate: day(9), sentAt: day(12) }, undefined, "x", NOON, TZ)).toEqual({ key: "inv.next.overdueNoReminder", params: { d: 9 } }));
  it("overdue, reminded: the day of the last reminder", () => expect(invoiceNext({ ...base, dueDate: day(2), sentAt: day(5) }, "Nov 14", "x", NOON, TZ)).toEqual({ key: "inv.next.overdueReminded", params: { d: 2, date: "Nov 14" } }));
  it("not yet due and sent: waiting until the due day", () => expect(invoiceNext({ ...base, dueDate: day(-3), sentAt: day(1) }, undefined, "Nov 18", NOON, TZ)).toEqual({ key: "inv.next.waiting", params: { date: "Nov 18" } }));
  it("not yet due and not sent", () => expect(invoiceNext({ ...base, dueDate: day(-3) }, undefined, "Nov 18", NOON, TZ)).toEqual({ key: "inv.next.notSent", params: { date: "Nov 18" } }));
  it("due today is not overdue", () => expect(invoiceNext({ ...base, dueDate: day(0), sentAt: day(1) }, undefined, "Nov 15", NOON, TZ).key).toBe("inv.next.waiting"));
});
