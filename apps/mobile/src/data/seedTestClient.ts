/**
 * #3024 (founder 26.11: «сделать какого-то клиента одного… в котором будет заполнена вся информация… тестовый клиент»):
 * ONE demo client with everything filled in, to check every screen on it — several people and phones, emails, a home and
 * a rental, an address for invoices; estimates in every status with a different number of lines; jobs, visits, a journal,
 * notes, tasks; invoices unpaid, partly paid, paid in full and overdue; tax on estimates and invoices.
 * A module adds its own part to this client (ModuleDef.demo, `TEST_CLIENT`): the core's seed knows nothing of it.
 *
 * Demo only (the cloud is not touched). Prices are PLACEHOLDERS (rule 9): demo values a company changes.
 */
import { sumCents } from "@octo/estimating-engine";
import type { Activity, ChecklistItem, Customer, EstimateDoc, Estimate, Invoice, Job, JobLineItem, Lead, Note, Payment, Property, Task, Visit } from "./types";
import { DEFAULT_SETTINGS, summarize } from "@/features/estimateDoc";
import type { DemoClient } from "@/modules/registry";

/** the demo clock of seed.ts (company time, Los Angeles) */
export interface SeedClock {
  at: (dayOffset: number, hour: number, minute?: number) => string;
  daysAgo: (d: number) => string;
  minutesAgo: (m: number) => string;
  hoursFromNow: (h: number) => string;
}

export const TEST_CLIENT_ID = "c8";
/** a test signature (an SVG path) */
const SIGN = "M10 40 C 30 10, 50 10, 60 35 S 90 60, 110 30";
const TAX = { enabled: true, rateBps: 950, groups: { service: false, labor: false, material: true } };

type Ln = EstimateDoc["options"][number]["lines"][number];
const L = (id: string, group: Ln["group"], name: string, quantity: string, unit: string, unitPriceCents: number, extra: Partial<Ln> = {}): Ln => ({
  id, group, name, quantity, unit, unitPriceCents, ...extra,
});

/** EST-0007 «Outlet repair» — sent; a module adds its own lines to it (the test client's open estimate) */
function outletDoc(): EstimateDoc {
  return {
    settings: { ...DEFAULT_SETTINGS, tax: TAX },
    note: "Outlet repair in the garage the same day.",
    options: [
      {
        id: "o-e7-1",
        name: "Standard",
        recommended: true,
        sections: [{ id: "s-e7-electric", title: "Electrical" }],
        lines: [
          L("l-e7-1", "labor", "Replace outlet / switch", "2", "ea", 8500, { catalogItemId: "cat-outlet", sectionId: "s-e7-electric", description: "Garage: two outlets, one to GFCI." }),
          L("l-e7-2", "material", "GFCI outlet 20A", "1", "ea", 2789, { catalogItemId: "cat-gfci", unitCostCents: 2426, sectionId: "s-e7-electric" }),
          L("l-e7-3", "service", "Service call / trip fee", "1", "flat", 8900, { catalogItemId: "cat-service-call" }),
        ],
      },
    ],
  };
}

/** EST-0009 «Interior painting, 3 rooms» — signed, two options, a discount */
function paintingDoc(): EstimateDoc {
  return {
    settings: { ...DEFAULT_SETTINGS, tax: TAX, discount: { kind: "pct", value: "0.05" } },
    note: "Walls and ceilings, two coats. Furniture moved and covered.",
    options: [
      {
        id: "o-e9-1",
        name: "Walls only",
        lines: [
          L("l-e9-1", "labor", "Interior painting, per room", "3", "room", 45000, { catalogItemId: "cat-paint-room" }),
          L("l-e9-2", "material", "Interior paint, 1 gal", "6", "gal", 4785, { catalogItemId: "cat-paint-gal", unitCostCents: 4161 }),
        ],
      },
      {
        id: "o-e9-2",
        name: "Walls + ceilings",
        recommended: true,
        lines: [
          L("l-e9-3", "labor", "Interior painting, per room", "3", "room", 45000, { catalogItemId: "cat-paint-room" }),
          L("l-e9-4", "labor", "Ceiling painting, per room", "3", "room", 18000),
          L("l-e9-5", "material", "Interior paint, 1 gal", "9", "gal", 4785, { catalogItemId: "cat-paint-gal", unitCostCents: 4161 }),
          L("l-e9-6", "service", "Debris haul-away (pickup load)", "1", "flat", 15000, { catalogItemId: "cat-haul" }),
        ],
      },
    ],
  };
}

const oneLine = (id: string, line: Ln, note?: string): EstimateDoc => ({
  settings: { ...DEFAULT_SETTINGS, tax: TAX },
  ...(note ? { note } : {}),
  options: [{ id, name: "Standard", recommended: true, lines: [line] }],
});

export function testClient(c: SeedClock, jobChecklist: (prefix: string) => ChecklistItem[]) {
  const sentAt7 = c.daysAgo(2);
  const e7doc = outletDoc();
  const e8doc = oneLine("o-e8-1", L("l-e8-1", "labor", "Replace kitchen faucet", "1", "ea", 18000, { catalogItemId: "cat-faucet" }), "Customer buys the faucet.");
  const e9doc = paintingDoc();
  const e9pick = { optionId: "o-e9-2", addonIds: [] };
  const e9sum = summarize(e9doc, e9pick);
  const e10doc: EstimateDoc = {
    settings: { ...DEFAULT_SETTINGS, tax: TAX },
    options: [{ id: "o-e10-1", name: "Standard", recommended: true, lines: [
      L("l-e10-1", "labor", "TV wall mount install", "2", "ea", 15000, { catalogItemId: "cat-tvmount" }),
      L("l-e10-2", "labor", "Handyman labor", "1.5", "hr", 9500, { catalogItemId: "cat-hour" }),
    ] }],
  };

  const customer: Customer = {
    id: TEST_CLIENT_ID, number: "CLT-0008", name: "Daniel Whitaker", firstName: "Daniel", lastName: "Whitaker", companyName: "Whitaker Rentals",
    phone: "(626) 555-0177", email: "dan.whitaker@example.com", sourceId: "src-referral", status: "active",
    tagIds: ["tag-vip", "tag-late"],
    billing: { line1: "PO Box 4410", city: "Arcadia", state: "CA", zip: "91066" },
    taxExempt: false,
    balanceCents: 0, // set below from the invoices
    people: [
      { id: "pp-c8-1", name: "Daniel Whitaker", role: "main", language: "en",
        phones: [{ number: "(626) 555-0177", label: "mobile", primary: true }, { number: "(626) 555-0178", label: "work" }, { number: "(626) 555-0179", label: "home" }],
        emails: [{ address: "dan.whitaker@example.com", primary: true }, { address: "billing@whitaker-rentals.example.com" }] },
      { id: "pp-c8-2", name: "Karen Whitaker", role: "spouse", language: "en",
        phones: [{ number: "(626) 555-0180", label: "mobile", primary: true }], emails: [{ address: "karen.w@example.com", primary: true }] },
      { id: "pp-c8-3", name: "Luis Ortega", role: "tenant", language: "es",
        phones: [{ number: "(626) 555-0181", label: "mobile", primary: true }], emails: [] },
      { id: "pp-c8-4", name: "Megan Price, CPA", role: "accountant",
        phones: [{ number: "(626) 555-0182", label: "work", primary: true }], emails: [{ address: "megan@price-cpa.example.com", primary: true }] },
    ],
  };
  const properties: Property[] = [
    { id: "p8", customerId: TEST_CLIENT_ID, address: "742 Fairview Ave", city: "Arcadia, CA 91007", place: { city: "Arcadia", state: "CA", zip: "91007" }, stories: 2,
      label: "Home", kind: "single_family", accessNotes: "Side gate on the left. Friendly dog — Max.", gateCode: "1975", geo: { lat: 34.1336, lng: -118.0353 } },
    { id: "p8b", customerId: TEST_CLIENT_ID, address: "1815 S Myrtle Ave", unit: "Unit B", city: "Monrovia, CA 91016", place: { city: "Monrovia", state: "CA", zip: "91016" }, stories: 1,
      label: "Rental", kind: "multi_family", accessNotes: "Call the tenant 30 min before.", contactIds: ["pp-c8-3"], geo: { lat: 34.1306, lng: -117.9989 } },
  ];

  const estimates: Estimate[] = [
    { id: "e7", number: "EST-0007", customerId: TEST_CLIENT_ID, propertyId: "p8", leadId: "l6", title: "Outlet repair", status: "sent",
      sentAt: sentAt7, viewedAt: c.daysAgo(1), savedAt: sentAt7, token: "demo0testclient0outlets000000007", doc: e7doc, ...summarize(e7doc) },
    { id: "e8", number: "EST-0008", customerId: TEST_CLIENT_ID, propertyId: "p8", title: "Kitchen faucet", status: "draft", savedAt: c.minutesAgo(90), doc: e8doc, ...summarize(e8doc) },
    { id: "e9", number: "EST-0009", customerId: TEST_CLIENT_ID, propertyId: "p8", title: "Interior painting, 3 rooms", status: "approved",
      sentAt: c.daysAgo(24), viewedAt: c.daysAgo(23), approvedAt: c.daysAgo(21), token: "demo0testclient0painting00000009", doc: e9doc, ...e9sum, depositPaidAt: c.daysAgo(20),
      signature: SIGN,
      approval: { ...e9pick, signerName: "Daniel Whitaker", signature: SIGN, at: c.daysAgo(21), channel: "portal", totalCents: e9sum.totalCents, depositCents: e9sum.depositCents, jobId: "j9", invoiceId: "i6" },
      countersign: { userId: "m-alex", signerName: "Alex Petrov", signerTitle: "Owner", signature: SIGN, at: c.daysAgo(21), method: "drawn" } },
    { id: "e10", number: "EST-0010", customerId: TEST_CLIENT_ID, propertyId: "p8b", title: "TV mounts in the rental", status: "declined",
      sentAt: c.daysAgo(15), viewedAt: c.daysAgo(14), token: "demo0testclient0tvmount000000010", doc: e10doc, ...summarize(e10doc) },
  ];

  // the rental job without an estimate (its own lines, tax on the materials)
  const jobLines: JobLineItem[] = [
    { id: "jl-j10-1", jobId: "j10", position: 0, name: "Drywall patch, up to 2×2 ft", catalogItemId: "cat-drywall", quantity: "2", unitPriceCents: 18000, taxable: false, totalCents: 36000 },
    { id: "jl-j10-2", jobId: "j10", position: 1, name: "Replace outlet / switch", catalogItemId: "cat-outlet", quantity: "3", unitPriceCents: 8500, taxable: false, totalCents: 25500 },
    { id: "jl-j10-3", jobId: "j10", position: 2, name: "GFCI outlet 20A", catalogItemId: "cat-gfci", quantity: "2", unitPriceCents: 2789, taxable: true, totalCents: 5578 },
  ];
  const j10tax = 530; // 9.5 % of $55.78, half up
  const j10total = sumCents([...jobLines.map((l) => l.totalCents), j10tax]);
  const jobs: Job[] = [
    { id: "j9", number: "JOB-0009", customerId: TEST_CLIENT_ID, propertyId: "p8", jobTypeId: "jt-install", title: "Interior painting, 3 rooms", status: "done", amountCents: e9sum.totalCents, estimateId: "e9", serviceCategoryId: "cat-painting" },
    { id: "j10", number: "JOB-0010", customerId: TEST_CLIENT_ID, propertyId: "p8b", jobTypeId: "jt-repair", title: "Drywall + outlets in the rental", status: "in_progress", amountCents: j10total,
      description: "Tenant reported two holes in the hallway and dead outlets in the kitchen.", taxEnabled: true, taxRateBps: 950, serviceCategoryId: "cat-handyman" },
    { id: "j11", number: "JOB-0011", customerId: TEST_CLIENT_ID, propertyId: "p8", jobTypeId: "jt-service", title: "Pressure washing", status: "unscheduled", amountCents: 0 },
  ];
  const visits: Visit[] = [
    { id: "v8", jobId: "j9", techId: "m-alex", assigneeIds: ["m-alex", "m-ivan"], start: c.at(-17, 8, 0), durationMin: 480, step: "paid", closed: true,
      scope: ["Paint living room, bedroom and office", "Ceilings in all three rooms"], checklist: jobChecklist("v8").map((x) => ({ ...x, done: true })), photos: [{ id: "ph-v8-1", kind: "before" }, { id: "ph-v8-2", kind: "after" }], amountDueCents: 0 },
    { id: "v9", jobId: "j10", techId: "m-alex", assigneeIds: ["m-alex", "m-dima"], start: c.at(-3, 10, 0), durationMin: 180, step: "paid", closed: true, note: "Tenant Luis will open the door.",
      scope: ["Patch 2 drywall holes in the hallway"], checklist: jobChecklist("v9").map((x) => ({ ...x, done: true })), photos: [{ id: "ph-v9-1", kind: "before" }, { id: "ph-v9-2", kind: "after" }], amountDueCents: 0 },
    { id: "v10", jobId: "j10", techId: "m-alex", assigneeIds: ["m-alex", "m-dima"], start: c.at(2, 13, 0), durationMin: 120, step: "scheduled", note: "Bring 2 GFCI outlets.",
      scope: ["Replace 3 kitchen outlets, 2 of them GFCI", "Prime and paint the patches"], checklist: jobChecklist("v10"), photos: [], amountDueCents: 0 },
    // the measurement visit (an inspection, no job)
    { id: "v11", propertyId: "p8", leadId: "l6", kind: "inspection", techId: "m-alex", start: c.at(-5, 15, 0), durationMin: 45, step: "done", closed: true,
      scope: ["Measure the front and the right side"], checklist: [], photos: [], amountDueCents: 0 },
  ];
  const lead: Lead = {
    id: "l6", number: "LEA-0006", assigneeId: "m-alex", name: "Daniel Whitaker", phone: "(626) 555-0177", email: "dan.whitaker@example.com", city: "Arcadia, CA 91007", address: "742 Fairview Ave",
    sourceId: "src-referral", receivedAt: c.daysAgo(8), firstResponseAt: c.daysAgo(8), lastActivityAt: c.daysAgo(2), status: "estimate_sent", customerId: TEST_CLIENT_ID, propertyId: "p8",
    service: "Exterior repairs", timeframe: "this_month", budgetCents: 250000, preferredContact: "call",
    message: "Need work on the front and the right side of the house. Also an outlet in the garage stopped working.",
  } as Lead;

  // invoices: paid in full (deposit), partly paid (final), unpaid (progress), overdue (progress)
  const deposit = e9sum.depositCents;
  const final = sumCents([e9sum.totalCents, -deposit]);
  const finalPaid = 50000;
  const invoices: Invoice[] = [
    { id: "i6", number: "INV-0106", title: "Deposit", kind: "deposit", customerId: TEST_CLIENT_ID, jobId: "j9", totalCents: deposit, paidCents: deposit, dueDate: c.daysAgo(21), sentAt: c.daysAgo(21), paidAt: c.daysAgo(20), method: "card" },
    { id: "i7", number: "INV-0107", title: "Final balance", kind: "final", customerId: TEST_CLIENT_ID, jobId: "j9", totalCents: final, paidCents: finalPaid, dueDate: c.daysAgo(-5), sentAt: c.daysAgo(9), method: "zelle" },
    { id: "i8", number: "INV-0108", title: "Progress: outlets & GFCI", kind: "progress", customerId: TEST_CLIENT_ID, jobId: "j10", totalCents: sumCents([j10total, -25000]), subtotalCents: sumCents([j10total, -25000, -j10tax]), taxCents: j10tax, taxMode: "added_on_top", paidCents: 0, dueDate: c.daysAgo(-10), sentAt: c.daysAgo(0) },
    { id: "i9", number: "INV-0109", title: "Progress: drywall", kind: "progress", customerId: TEST_CLIENT_ID, jobId: "j10", totalCents: 25000, subtotalCents: 25000, taxCents: 0, taxMode: "added_on_top", paidCents: 0, dueDate: c.daysAgo(12), sentAt: c.daysAgo(26) },
  ];
  const payments: Payment[] = [
    { id: "pay6", invoiceId: "i6", customerId: TEST_CLIENT_ID, amountCents: deposit, method: "card", at: c.daysAgo(20), receiptNumber: "RCT-0105", receivedBy: "m-alex" },
    { id: "pay7", invoiceId: "i7", customerId: TEST_CLIENT_ID, amountCents: 30000, method: "zelle", at: c.daysAgo(8), receiptNumber: "RCT-0106", reference: "Zelle conf. TEST-7781", receivedBy: "m-alex" },
    { id: "pay8", invoiceId: "i7", customerId: TEST_CLIENT_ID, amountCents: 20000, method: "check", at: c.daysAgo(3), receiptNumber: "RCT-0107", reference: "Check #2210", receivedBy: "m-ivan" },
  ];
  customer.balanceCents = sumCents(invoices.map((i) => sumCents([i.totalCents, -i.paidCents])));

  const notes: Note[] = [
    { id: "n3", subjectType: "customer", subjectId: TEST_CLIENT_ID, body: "TEST CLIENT — everything filled in to check the screens. Prefers calls before 6 pm; Karen decides on colors.", visibility: "team", pinned: true, authorId: "m-alex", at: c.daysAgo(8) },
    { id: "n4", subjectType: "customer", subjectId: TEST_CLIENT_ID, body: "Owns 2 rentals, more work likely. Pays by Zelle or check.", visibility: "private", pinned: false, authorId: "m-alex", at: c.daysAgo(6) },
    { id: "n5", subjectType: "property", subjectId: "p8", body: "Front fascia board soft near the right corner — check before hanging anything on it.", visibility: "team", pinned: false, authorId: "m-alex", at: c.daysAgo(5) },
    { id: "n6", subjectType: "job", subjectId: "j10", body: "Hallway holes ~6″ each. Kitchen outlets: breaker fine, outlets burnt.", visibility: "team", pinned: true, authorId: "m-dima", at: c.daysAgo(3) },
    { id: "n7", subjectType: "estimate", subjectId: "e7", body: "An add-on offered; Daniel will think about it.", visibility: "team", pinned: false, authorId: "m-alex", at: c.daysAgo(2) },
  ];
  const activities: Activity[] = [
    { id: "a3", subjectType: "customer", subjectId: TEST_CLIENT_ID, kind: "call", direction: "in", contactId: "pp-c8-1", body: "Asked about work on the front and the right side of the house.", at: c.daysAgo(8), actorId: "m-alex" },
    { id: "a4", subjectType: "customer", subjectId: TEST_CLIENT_ID, kind: "sms", direction: "out", contactId: "pp-c8-1", body: "Confirming the measurement tomorrow at 3 pm.", at: c.daysAgo(6), actorId: "m-alex" },
    { id: "a5", subjectType: "customer", subjectId: TEST_CLIENT_ID, kind: "call", direction: "in", contactId: "pp-c8-2", body: "Karen asked to add the garage outlet to the estimate.", at: c.daysAgo(4), actorId: "m-alex" },
    { id: "a6", subjectType: "customer", subjectId: TEST_CLIENT_ID, kind: "email", direction: "out", contactId: "pp-c8-1", body: "Sent the estimate EST-0007.", at: sentAt7, actorId: "m-alex" },
    { id: "a7", subjectType: "customer", subjectId: TEST_CLIENT_ID, kind: "sms", direction: "out", contactId: "pp-c8-1", body: "Hi Daniel, the outlets at the rental are booked for 1 pm — Alex will be there.", at: c.minutesAgo(240), actorId: "m-alex" },
    { id: "a8", subjectType: "estimate", subjectId: "e7", kind: "status", meta: { from: "draft", to: "sent" }, at: sentAt7, actorId: "m-alex" },
    { id: "a9", subjectType: "job", subjectId: "j10", kind: "status", meta: { from: "scheduled", to: "in_progress" }, at: c.daysAgo(3), actorId: "m-dima" },
    { id: "a10", subjectType: "lead", subjectId: "l6", kind: "status", meta: { from: "booked", to: "estimate_sent" }, at: sentAt7, actorId: "m-alex" },
  ];
  const tasks: Task[] = [
    { id: "t2", subjectType: "customer", subjectId: TEST_CLIENT_ID, title: "Call Daniel about the estimate EST-0007", dueAt: c.hoursFromNow(26), assigneeId: "m-alex" },
    { id: "t3", subjectType: "job", subjectId: "j10", title: "Pick up 2 GFCI outlets", dueAt: c.hoursFromNow(40), assigneeId: "m-dima" },
  ];

  const demo: DemoClient = { customerId: TEST_CLIENT_ID, propertyId: "p8", leadId: "l6", estimateId: "e7", at: sentAt7 };
  return { customer, properties, estimates, jobs, jobLines, visits, lead, invoices, payments, notes, activities, tasks, demo };
}
