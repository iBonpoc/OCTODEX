/** Reports v1 (wave 8, docs/specs/18-money-reports.md §5; S14): the records each report takes; sums are the engine's. */
import { afterEach, describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Invoice } from "../src/data/types";
import { setZone } from "../src/features/zone";
import { periodNumbers } from "../src/features/metrics";
import { canExportCsv, canSeeReports, categoryReport, collectedReport, NO_CATEGORY, invoiceSource, owedReport, REPEAT, salesReport, sourcesReport, toCsv, UNKNOWN } from "../src/features/reports";

afterEach(() => setZone("America/Los_Angeles"));
const NOW = Date.parse("2026-11-06T00:30:00Z"); // the 5th in LA

describe("1. «Кто должен»", () => {
  it("by client, the company's days; total = «Ждёт оплаты» on Today", () => {
    const db = makeSeed();
    const r = owedReport(db);
    expect(r.owesCents).toBe(periodNumbers(db, "today").awaitingCents);
    expect(r.rows.every((x) => x.owesCents > 0)).toBe(true);
  });
  it("overdue only after the due day of the company", () => {
    setZone("America/Los_Angeles");
    const inv = (dueDate: string): Invoice => ({ id: dueDate, customerId: "c", jobId: "j", totalCents: 1000, paidCents: 0, dueDate });
    const r = owedReport({ invoices: [inv("2026-11-05"), inv("2026-11-04")] }, NOW);
    expect(r).toMatchObject({ owesCents: 2000, overdueCents: 1000 });
    expect(r.rows[0]!.maxDaysOverdue).toBe(1);
  });
});

describe("2. «Собрано за период»", () => {
  it("by method and by person; a payment without a person is «unknown»", () => {
    const db = makeSeed();
    db.payments.push({ id: "px", invoiceId: "i1", customerId: "c2", amountCents: 1000, method: "cash", at: db.payments[0]!.at });
    const r = collectedReport(db, "all");
    expect(r.totalCents).toBe(db.payments.reduce((s, x) => s + x.amountCents, 0));
    expect(r.byPerson.find((x) => x.key === UNKNOWN)).toEqual({ key: UNKNOWN, cents: 1000, count: 1 });
    expect(r.byPerson.reduce((s, x) => s + x.cents, 0)).toBe(r.totalCents);
    expect(r.byMethod.reduce((s, x) => s + x.cents, 0)).toBe(r.totalCents);
  });
  it("today = the received figure of Today", () => {
    const db = makeSeed();
    expect(collectedReport(db, "today").totalCents).toBe(periodNumbers(db, "today").receivedCents);
  });
});

describe("3. «Продажи»", () => {
  it("the same numbers as Today for today / week / month", () => {
    const db = makeSeed();
    for (const p of ["today", "week", "month"] as const) {
      const n = periodNumbers(db, p);
      expect(salesReport(db, p)).toEqual({ sent: n.sent, signed: n.signed, signedCents: n.signedCents, signedPct: n.sentToSignedPct });
    }
  });
});

describe("4. «Источник лида → выручка»", () => {
  const base = (): Pick<DB, "jobs" | "estimates" | "leads" | "customers" | "invoices"> => ({
    customers: [{ id: "c", name: "C", phone: "", sourceId: "src-yelp", balanceCents: 0 }],
    leads: [{ id: "l", sourceId: "src-google" } as DB["leads"][number]],
    estimates: [{ id: "e", leadId: "l" } as DB["estimates"][number]],
    jobs: [
      { id: "j1", estimateId: "e" } as DB["jobs"][number],
      { id: "j2" } as DB["jobs"][number],
      { id: "j3" } as DB["jobs"][number],
    ],
    invoices: [],
  });
  const inv = (id: string, jobId: string, sentAt: string, subtotalCents?: number): Invoice => ({ id, customerId: "c", jobId, totalCents: 10825, subtotalCents, paidCents: 0, dueDate: sentAt, sentAt });
  it("job → estimate → lead → source; no lead: the client's source for the first job, then «repeat»", () => {
    const db = base();
    db.invoices = [inv("a", "j2", "2026-10-01T17:00:00Z"), inv("b", "j1", "2026-10-02T17:00:00Z"), inv("c", "j3", "2026-10-03T17:00:00Z")];
    expect(db.invoices.map((i) => invoiceSource(db, i))).toEqual(["src-yelp", "src-google", REPEAT]);
  });
  it("revenue before tax of invoices sent in the period (the company's day); no subtotal → total", () => {
    setZone("America/Los_Angeles");
    const db = base();
    db.invoices = [
      inv("a", "j2", "2026-11-06T01:00:00Z", 10000), // the 5th in LA: this week (Mon 2nd)
      inv("b", "j1", "2026-11-03T17:00:00Z", 20000),
      inv("c", "j3", "2026-10-30T17:00:00Z"), // last week
    ];
    const r = sourcesReport(db, "week", "2026-11-05");
    expect(r.totalCents).toBe(30000);
    expect(r.rows).toEqual([
      { key: "src-google", cents: 20000, count: 1 },
      // «c» (Oct 30) is the client's first invoiced job → the client's source; «a» is a later job without a lead → repeat
      { key: REPEAT, cents: 10000, count: 1 },
    ]);
    expect(sourcesReport(db, "all", "2026-11-05").rows.find((x) => x.key === "src-yelp")?.cents).toBe(10825);
  });
});

describe("who sees and exports", () => {
  it("reports: owner/admin and office; CSV: the owner only", () => {
    expect([canSeeReports("director"), canSeeReports("dispatcher"), canSeeReports("sales"), canSeeReports("tech")]).toEqual([true, true, false, false]);
    const db = { me: "a", members: [{ id: "a", name: "A", initials: "A", kind: "employee" as const, roles: ["director" as const], isOwner: true }, { id: "b", name: "B", initials: "B", kind: "employee" as const, roles: ["director" as const] }] };
    expect(canExportCsv(db, "director")).toBe(true);
    expect(canExportCsv(db, "dispatcher")).toBe(false);
    expect(canExportCsv({ ...db, me: "b" }, "director")).toBe(false); // an admin is «director» too, but not the owner
  });
});

describe("CSV", () => {
  it("quotes, BOM, CRLF; a formula is read as text, a negative number stays a number", () => {
    expect(toCsv(["Client", "Owed"], [["Kim, David", "1840.00"], ['Say "hi"', "-25.00"], ["=HYPERLINK(1)", 3]])).toBe(
      '﻿Client,Owed\r\n"Kim, David",1840.00\r\n"Say ""hi""",-25.00\r\n\'=HYPERLINK(1),3\r\n',
    );
  });
});

describe("5. «По направлениям» (18 §11)", () => {
  // the 5th of November in LA = today; 00:30Z on the 6th is still the 5th there
  const TODAY = "2026-11-05";
  const base = (): Pick<DB, "leads" | "estimates" | "jobs" | "invoices" | "serviceCategories"> => ({
    serviceCategories: [
      { id: "roof", seedKey: "roofing", position: 0 },
      { id: "old", name: "Old", position: 1, archivedAt: "2026-10-01T00:00:00Z" },
    ],
    leads: [
      { id: "l1", serviceCategoryId: "roof", status: "won", receivedAt: "2026-11-06T00:30:00Z" } as DB["leads"][number],
      { id: "l2", serviceCategoryId: "roof", status: "new", receivedAt: "2026-11-05T08:00:00Z" } as DB["leads"][number],
      // the 4th in LA: outside «today»
      { id: "l3", serviceCategoryId: "roof", status: "won", receivedAt: "2026-11-05T06:59:00Z" } as DB["leads"][number],
      // a direction the company does not have → «none»
      { id: "l4", serviceCategoryId: "gone", status: "new", receivedAt: "2026-11-05T10:00:00Z" } as DB["leads"][number],
    ],
    estimates: [
      { id: "e1", serviceCategoryId: "old", status: "approved", sentAt: "2026-11-05T09:00:00Z", approvedAt: "2026-11-05T10:00:00Z", totalCents: 50000 } as DB["estimates"][number],
      { id: "e2", status: "sent", sentAt: "2026-11-05T09:00:00Z", totalCents: 70000 } as DB["estimates"][number],
    ],
    jobs: [
      // the job's own direction, not its estimate's (spec 11 §1)
      { id: "j1", serviceCategoryId: "roof", estimateId: "e1" } as DB["jobs"][number],
      { id: "j2" } as DB["jobs"][number],
    ],
    invoices: [
      { id: "i1", customerId: "c", jobId: "j1", totalCents: 10825, subtotalCents: 10000, paidCents: 0, dueDate: TODAY, sentAt: "2026-11-05T12:00:00Z" },
      { id: "i2", customerId: "c", jobId: "j1", totalCents: 5000, paidCents: 0, dueDate: TODAY, sentAt: "2026-11-05T13:00:00Z" },
      { id: "i3", customerId: "c", jobId: "j2", totalCents: 9000, paidCents: 0, dueDate: TODAY, sentAt: "2026-11-05T13:00:00Z" },
      // a draft is not revenue
      { id: "i4", customerId: "c", jobId: "j1", totalCents: 99999, paidCents: 0, dueDate: TODAY },
    ],
  });
  it("today in the company's zone: leads, estimates, revenue through the job; «none» last", () => {
    setZone("America/Los_Angeles");
    const r = categoryReport(base(), "today", TODAY);
    expect(r.rows.map((x) => x.key)).toEqual(["roof", "old", NO_CATEGORY]);
    expect(r.rows[0]).toMatchObject({ leads: 2, won: 1, wonPct: 50, jobs: 1, invoices: 2, revenueCents: 15000, avgCents: 15000 });
    // archived direction keeps its estimate
    expect(r.rows[1]).toMatchObject({ sent: 1, signed: 1, signedCents: 50000, revenueCents: 0 });
    expect(r.rows[2]).toMatchObject({ leads: 1, sent: 1, signed: 0, jobs: 1, revenueCents: 9000 });
    expect(r.total).toMatchObject({ leads: 3, revenueCents: 24000, jobs: 2, avgCents: 12000 });
  });
  it("all time takes the lead of the 4th too; the revenue total = «Источник лида → выручка»", () => {
    const db = base();
    const r = categoryReport(db, "all", TODAY);
    expect(r.total.leads).toBe(4);
    const src = sourcesReport({ ...db, customers: [] }, "all", TODAY);
    expect(r.total.revenueCents).toBe(src.totalCents);
  });
  it("seed: totals match «Продажи» and «Источник» for every period", () => {
    const db = makeSeed();
    for (const p of ["today", "week", "month", "all"] as const) {
      const r = categoryReport(db, p);
      const s = salesReport(db, p);
      expect([r.total.sent, r.total.signed, r.total.signedCents]).toEqual([s.sent, s.signed, s.signedCents]);
      expect(r.total.revenueCents).toBe(sourcesReport(db, p).totalCents);
    }
  });
});
