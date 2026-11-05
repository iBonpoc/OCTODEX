/**
 * Test data (placeholder prices — founder rule: real prices are never typed into seeds).
 * All times are relative to "now" so the demo always looks like a live day in Los Angeles.
 */
import type { DB, ChecklistItem, CatalogItem, Company, EstimateDoc, Source, Tag } from "./types";
import { DEFAULT_SETTINGS, summarize } from "@/features/estimateDoc";

/** Test catalog for several trades. All prices are PLACEHOLDERS (badge "test price"). */
const S = (id: string, name: string, unit: string, priceCents: number, kind: "service" | "labor" = "service"): CatalogItem => ({
  id, kind, name, unit, priceCents, placeholder: true,
});
const MAT = (id: string, name: string, unit: string, costCents: number, vendor: string, vendorTaxBps: number, markupBps: number): CatalogItem => ({
  id, kind: "material", name, unit, priceCents: 0, costCents, vendor, vendorTaxBps, markupBps, placeholder: true,
});
export const SEED_CATALOG: CatalogItem[] = [
  // handyman
  S("cat-haul", "Debris haul-away (pickup load)", "flat", 15000),
  S("cat-carpet", "Carpet removal", "sq ft", 150, "labor"),
  S("cat-railing", "Install stair railing", "ea", 25000, "labor"),
  S("cat-bulb", "Replace light bulb / fixture lamp", "ea", 2500, "labor"),
  S("cat-hour", "Handyman labor", "hr", 9500, "labor"),
  MAT("cat-bracket", "Railing bracket", "ea", 1000, "Home Depot", 1025, 1000),
  MAT("cat-led", "LED bulb A19", "ea", 600, "Home Depot", 1025, 1000),
  { id: "kit-railing", kind: "kit", name: "Stair railing kit (install + 12 brackets)", unit: "kit", priceCents: 0, placeholder: true,
    components: [{ itemId: "cat-railing", qty: "1" }, { itemId: "cat-bracket", qty: "12" }] },
  // cleaning, painting, plumbing, electrical
  S("cat-deepclean", "Deep clean, per room", "room", 9000),
  S("cat-paint-room", "Interior painting, per room", "room", 45000, "labor"),
  MAT("cat-paint-gal", "Interior paint, 1 gal", "gal", 3800, "Sherwin-Williams", 950, 1500),
  S("cat-faucet", "Replace kitchen faucet", "ea", 18000, "labor"),
  S("cat-outlet", "Replace outlet / switch", "ea", 8500, "labor"),
  S("cat-drywall", "Drywall patch, up to 2×2 ft", "ea", 18000, "labor"),
  S("cat-tvmount", "TV wall mount install", "ea", 15000, "labor"),
  MAT("cat-gfci", "GFCI outlet 20A", "ea", 2200, "Home Depot", 1025, 1500),
  S("cat-service-call", "Service call / trip fee", "flat", 8900),
];

function demoDoc(): EstimateDoc {
  const L = (id: string, group: "service" | "labor" | "material", name: string, quantity: string, unit: string, unitPriceCents: number, extra: object = {}) => ({
    id, group, name, quantity, unit, unitPriceCents, ...extra,
  });
  return {
    settings: { ...DEFAULT_SETTINGS, tax: { enabled: true, rateBps: 950, groups: { service: false, labor: false, material: true } } },
    note: "Work in 1 day. Debris hauled away the same day.",
    options: [
      {
        id: "o-e6-1",
        name: "Standard",
        recommended: true,
        lines: [
          L("l-e6-1", "service", "Debris haul-away (pickup load)", "1", "flat", 15000, { catalogItemId: "cat-haul" }),
          L("l-e6-2", "labor", "Carpet removal", "120", "sq ft", 150, { catalogItemId: "cat-carpet" }),
          L("l-e6-3", "labor", "Install stair railing", "1", "ea", 25000, { catalogItemId: "cat-railing" }),
          L("l-e6-4", "labor", "Replace light bulb / fixture lamp", "1", "ea", 2500, { catalogItemId: "cat-bulb" }),
          L("l-e6-5", "material", "Railing bracket", "12", "ea", 1213, { catalogItemId: "cat-bracket", unitCostCents: 1103 }),
          L("l-e6-6", "material", "LED bulb A19", "1", "ea", 728, { catalogItemId: "cat-led", unitCostCents: 662 }),
          L("l-e6-7", "service", "Deep clean after work", "1", "room", 9000, { optional: true }),
        ],
      },
    ],
  };
}

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}
/** Standard lead sources of a new company (the same list the server seeds); the company edits it. */
export const SEED_SOURCES: Source[] = [
  { id: "src-thumbtack", name: "Thumbtack", kind: "marketplace", active: true, system: true, position: 1 },
  { id: "src-yelp", name: "Yelp", kind: "marketplace", active: true, system: true, position: 2 },
  { id: "src-google", name: "Google", kind: "marketplace", active: true, system: true, position: 3 },
  { id: "src-angi", name: "Angi", kind: "marketplace", active: true, system: true, position: 4 },
  { id: "src-nextdoor", name: "Nextdoor", kind: "marketplace", active: true, system: true, position: 5 },
  { id: "src-facebook", name: "Facebook", kind: "ads", active: true, system: true, position: 6 },
  { id: "src-website", name: "Website", kind: "own", active: true, system: true, position: 7 },
  { id: "src-referral", name: "Referral", kind: "own", active: true, system: true, position: 8 },
  { id: "src-repeat", name: "Repeat", kind: "own", active: true, system: true, position: 9 },
  { id: "src-other", name: "Other", kind: "own", active: true, system: true, position: 10 },
  { id: "src-kolya", name: "Kolya (contractor)", kind: "person", phone: "(818) 555-0101", active: true, position: 11 },
];
/** Default client tags (the same list the server seeds); names of system tags are shown translated. */
export const SEED_TAGS: Tag[] = [
  { id: "tag-vip", name: "VIP", active: true, system: true, position: 1 },
  { id: "tag-regular", name: "Regular", active: true, system: true, position: 2 },
  { id: "tag-favorite", name: "Favorite", active: true, system: true, position: 3 },
  { id: "tag-late", name: "No calls after 6 pm", active: true, system: true, position: 4 },
];
/** Generic job checklist (company templates come later; trade modules add their own). */
const jobChecklist = (prefix: string): ChecklistItem[] =>
  [
    "Protect floors and furniture",
    "Confirm scope with the client",
    "Photos before work",
    "Clean up the work area",
    "Photos after work",
    "Walk through with the client",
  ].map((label, i) => ({ id: `${prefix}-c${i}`, label, done: false }));

/** Demo company: partly filled so the setup checklist shows what is left. Test license number. */
export const DEMO_COMPANY: Company = {
  id: "demo-company",
  name: "OCTODEX Demo Home Services",
  legalName: "OCTODEX Demo Home Services LLC",
  entityType: "llc",
  phone: "(626) 555-0100",
  email: "office@example.com",
  address: { line1: "100 E Colorado Blvd", city: "Pasadena", state: "CA", zip: "91105" },
  timezone: "America/Los_Angeles",
  trades: ["handyman", "plumbing", "electrical", "painting"],
  brand: {},
  insurance: {},
  estimate: { validDays: 7, depositBps: 1000 },
  payment: {},
  licenses: [{ id: "lic-demo", kind: "cslb", number: "TEST-000000", classes: ["B"], onDocuments: true }],
  contacts: [{ id: "cc-demo", name: "Alex Petrov", title: "Owner", phone: "(626) 555-0100", email: "office@example.com", isPrimary: true, onDocuments: true }],
  skipped: [],
};

export function makeSeed(): DB {
  return {
    me: "m-alex",
    sources: SEED_SOURCES,
    tags: SEED_TAGS,
    tasks: [
      { id: "t1", subjectType: "lead", subjectId: "l3", title: "Send the painting estimate", dueAt: hoursFromNow(20), assigneeId: "m-alex" },
    ],
    activities: [
      { id: "a1", subjectType: "lead", subjectId: "l3", kind: "call", at: minutesAgo(80), actorId: "m-alex" },
      { id: "a2", subjectType: "lead", subjectId: "l3", kind: "status", meta: { from: "new", to: "replied" }, at: minutesAgo(80), actorId: "m-alex" },
    ],
    members: [
      { id: "m-alex", name: "Alex Petrov", initials: "AP", kind: "employee", roles: ["director", "dispatcher", "tech"] },
      { id: "m-ivan", name: "Ivan Sokolov", initials: "IS", kind: "employee", roles: ["tech"] },
      { id: "m-dima", name: "Dmitry Orlov", initials: "DO", kind: "employee", roles: ["tech"] },
      { id: "m-sub", name: "Valley Electric LLC", initials: "VE", kind: "sub", roles: ["tech"] },
    ],
    customers: [
      {
        id: "c1", number: "CLT-0001", name: "Sarah Mitchell", phone: "(626) 555-0142", email: "sarah.m@example.com", sourceId: "src-google", balanceCents: 0, tagIds: ["tag-vip", "tag-regular"],
        people: [
          { id: "pp-c1-1", name: "Sarah Mitchell", role: "main", phones: [{ number: "(626) 555-0142", label: "mobile", primary: true }, { number: "(626) 555-0143", label: "work" }], emails: [{ address: "sarah.m@example.com", primary: true }] },
          { id: "pp-c1-2", name: "Tom Mitchell", role: "spouse", phones: [{ number: "(626) 555-0144", label: "mobile", primary: true }], emails: [] },
        ],
      },
      { id: "c2", number: "CLT-0002", name: "David Kim", phone: "(818) 555-0187", sourceId: "src-thumbtack", balanceCents: 184000 },
      { id: "c3", number: "CLT-0003", name: "Linda Alvarez", phone: "(310) 555-0110", email: "lalvarez@example.com", sourceId: "src-referral", balanceCents: 0, tagIds: ["tag-favorite"] },
      { id: "c4", number: "CLT-0004", name: "Robert Chen", phone: "(323) 555-0166", sourceId: "src-yelp", balanceCents: 96000, tagIds: ["tag-late"] },
      { id: "c5", number: "CLT-0005", name: "Maria Gonzalez", phone: "(562) 555-0133", sourceId: "src-website", balanceCents: 0 },
      { id: "c6", number: "CLT-0006", name: "James O'Connor", phone: "(424) 555-0199", sourceId: "src-google", balanceCents: 0 },
      { id: "c7", number: "CLT-0007", name: "Emily Park", phone: "(213) 555-0121", sourceId: "src-thumbtack", balanceCents: 0 },
    ],
    properties: [
      { id: "p1", customerId: "c1", address: "1420 Oak Grove Ave", city: "Pasadena, CA 91103", stories: 2 },
      { id: "p1b", customerId: "c1", address: "88 Rosemont Ave", city: "Pasadena, CA 91103", stories: 1 },
      { id: "p2", customerId: "c2", address: "4512 Ventura Canyon Ave", city: "Sherman Oaks, CA 91423", stories: 2 },
      { id: "p3", customerId: "c3", address: "2207 Ocean Park Blvd", city: "Santa Monica, CA 90405", stories: 1 },
      { id: "p4", customerId: "c4", address: "735 N Kenwood St", city: "Glendale, CA 91206", stories: 2 },
      { id: "p5", customerId: "c5", address: "3901 E 4th St", city: "Long Beach, CA 90814", stories: 1 },
      { id: "p6", customerId: "c6", address: "11350 Culver Blvd", city: "Culver City, CA 90230", stories: 3 },
      { id: "p7", customerId: "c7", address: "520 W Olive Ave", city: "Burbank, CA 91506", stories: 2 },
    ],
    jobs: [
      { id: "j1", propertyId: "p1", title: "Bathroom remodel: vanity, toilet, tile", status: "scheduled", amountCents: 342000, estimateId: "e5" },
      { id: "j2", propertyId: "p2", title: "Kitchen faucet + garbage disposal", status: "scheduled", amountCents: 68000 },
      { id: "j3", propertyId: "p3", title: "Drywall patch + paint touch-up", status: "scheduled", amountCents: 42000 },
      { id: "j4", propertyId: "p4", title: "Interior painting, 2 bedrooms", status: "done", amountCents: 96000 },
      { id: "j5", propertyId: "p5", title: "Deep clean after move-out", status: "scheduled", amountCents: 156000 },
      { id: "j6", propertyId: "p6", title: "Panel upgrade 200A", status: "scheduled", amountCents: 518000 },
      { id: "j7", propertyId: "p7", title: "Estimate visit", status: "estimate", amountCents: 0 },
      { id: "j8", propertyId: "p1b", title: "TV mount + shelves", status: "done", amountCents: 24000 },
    ],
    visits: [
      {
        id: "v1", jobId: "j1", techId: "m-alex", start: at(0, 8, 30), durationMin: 240, step: "scheduled",
        scope: ["Remove old vanity and toilet", "Install new vanity, faucet and toilet", "Tile backsplash, 24 sq ft"],
        checklist: jobChecklist("v1"), photos: [], amountDueCents: 342000,
      },
      {
        id: "v2", jobId: "j2", techId: "m-alex", start: at(0, 13, 30), durationMin: 120, step: "scheduled",
        scope: ["Replace kitchen faucet", "Install 3/4 HP garbage disposal"],
        checklist: jobChecklist("v2").slice(0, 4), photos: [], amountDueCents: 68000,
      },
      {
        id: "v3", jobId: "j3", techId: "m-alex", start: at(0, 16, 0), durationMin: 60, step: "scheduled",
        scope: ["Patch 2 drywall holes in hallway", "Prime and paint touch-up"],
        checklist: jobChecklist("v3").slice(1, 4), photos: [], amountDueCents: 42000,
      },
      {
        id: "v4", jobId: "j5", techId: "m-ivan", start: at(0, 9, 0), durationMin: 180, step: "working",
        scope: ["Deep clean 3-bedroom house after move-out"], checklist: jobChecklist("v4"), photos: [{ id: "ph1", kind: "before" }], amountDueCents: 156000,
      },
      {
        id: "v5", jobId: "j6", techId: "m-sub", start: at(0, 10, 0), durationMin: 360, step: "en_route", late: true,
        scope: ["Replace 100A panel with 200A", "Permit and inspection"], checklist: jobChecklist("v5"), photos: [], amountDueCents: 518000,
      },
      {
        id: "v6", jobId: "j7", techId: null, start: at(0, 15, 0), durationMin: 45, step: "scheduled",
        scope: ["Free estimate: fence repair and gate"], checklist: [], photos: [], amountDueCents: 0,
      },
      {
        id: "v7", jobId: "j1", techId: "m-alex", start: at(1, 9, 0), durationMin: 90, step: "scheduled",
        scope: ["Final walkthrough and touch-up"], checklist: [], photos: [], amountDueCents: 0,
      },
    ],
    leads: [
      { id: "l1", number: "LEA-0001", assigneeId: "m-alex", name: "Kevin Brooks", phone: "(818) 555-0170", city: "Encino", sourceId: "src-thumbtack", receivedAt: minutesAgo(4), status: "new", costCents: 4500, service: "Water heater replacement", timeframe: "asap",
        message: "Water heater is leaking, need a replacement quote. 40 gal gas." },
      { id: "l2", number: "LEA-0002", assigneeId: "m-alex", name: "Angela Rossi", phone: "(310) 555-0155", city: "Torrance", sourceId: "src-google", receivedAt: minutesAgo(22), status: "new",
        message: "Need a handyman for a few small things: shelves, a door that sticks, a light fixture." },
      { id: "l3", number: "LEA-0003", assigneeId: "m-alex", name: "Tom Becker", phone: "(626) 555-0108", city: "Arcadia", sourceId: "src-yelp", receivedAt: minutesAgo(95), status: "replied", firstResponseAt: minutesAgo(80),
        service: "Interior painting", timeframe: "this_month", budgetCents: 150000, preferredContact: "sms",
        message: "Quote for painting the living room and hallway?" },
      { id: "l4", number: "LEA-0004", assigneeId: "m-alex", name: "Nina Patel", phone: "(213) 555-0191", city: "Los Angeles", sourceId: "src-website", receivedAt: daysAgo(1), status: "booked",
        message: "Two outlets in the kitchen stopped working." },
      { id: "l5", number: "LEA-0005", assigneeId: "m-alex", name: "Linda Alvarez", phone: "(310) 555-0110", email: "lalvarez@example.com", city: "Santa Monica, CA 90405", address: "2207 Ocean Park Blvd",
        sourceId: "src-referral", receivedAt: daysAgo(17), lastActivityAt: daysAgo(16), status: "estimate_sent", customerId: "c3", propertyId: "p3",
        message: "Carpet removal, stair railing, a light fixture and haul-away after renovation." },
    ],
    estimates: [
      { id: "e1", customerId: "c6", propertyId: "p6", title: "Panel upgrade 200A", totalCents: 518000, status: "approved", sentAt: daysAgo(6), approvedAt: minutesAgo(180) },
      { id: "e2", customerId: "c7", propertyId: "p7", title: "Fence repair + new gate", totalCents: 298000, status: "sent", sentAt: daysAgo(3) },
      { id: "e3", customerId: "c5", propertyId: "p5", title: "Deep clean after move-out", totalCents: 156000, status: "approved", sentAt: daysAgo(9), approvedAt: daysAgo(4) },
      { id: "e4", customerId: "c3", propertyId: "p3", title: "Kitchen backsplash tile", totalCents: 264000, status: "sent", sentAt: daysAgo(6) },
      { id: "e5", customerId: "c1", propertyId: "p1", title: "Bathroom remodel", totalCents: 342000, status: "approved", sentAt: daysAgo(12), approvedAt: daysAgo(8), depositCents: 34200, depositPaidAt: daysAgo(8) },
      (() => {
        const doc = demoDoc();
        return {
          id: "e6", customerId: "c3", propertyId: "p3", leadId: "l5", number: "EST-0006", title: "Carpet, railing, bulb, haul-away", status: "sent" as const,
          sentAt: daysAgo(1), token: "demo0handyman0estimate0000000001", doc, ...summarize(doc),
        };
      })(),
    ],
    catalog: SEED_CATALOG,
    notices: [],
    company: DEMO_COMPANY,
    notes: [
      { id: "n1", subjectType: "customer", subjectId: "c1", body: "Gate code 4512. Small dog in the backyard — call before entering.", visibility: "team", pinned: true, authorId: "m-alex", at: daysAgo(10) },
      { id: "n2", subjectType: "customer", subjectId: "c1", body: "Pays fast, asks for a discount every time.", visibility: "private", pinned: false, authorId: "m-alex", at: daysAgo(5) },
    ],
    expenses: [
      { id: "x1", jobId: "j5", vendor: "Home Depot", category: "materials", amountCents: 41260, at: minutesAgo(300), memberId: "m-ivan" },
      { id: "x2", jobId: "j1", vendor: "ABC Supply", category: "materials", amountCents: 88400, at: daysAgo(1), memberId: "m-alex" },
      { id: "x3", jobId: null, vendor: "Chevron", category: "fuel", amountCents: 7850, at: minutesAgo(200), memberId: "m-alex" },
    ],
    invoices: [
      { id: "i1", number: "INV-0101", title: "Final balance", kind: "final", customerId: "c2", jobId: "j2", totalCents: 184000, paidCents: 0, dueDate: daysAgo(9), sentAt: daysAgo(12) },
      { id: "i2", number: "INV-0102", title: "Final balance", kind: "final", customerId: "c4", jobId: "j4", totalCents: 96000, paidCents: 0, dueDate: daysAgo(-3), sentAt: daysAgo(1) },
      { id: "i3", number: "INV-0103", title: "Final balance", kind: "final", customerId: "c1", jobId: "j8", totalCents: 24000, paidCents: 24000, dueDate: daysAgo(2), paidAt: minutesAgo(140), method: "zelle", sentAt: daysAgo(3) },
      { id: "i4", number: "INV-0104", title: "Final balance", kind: "final", customerId: "c5", jobId: "j5", totalCents: 78000, paidCents: 78000, dueDate: daysAgo(0), paidAt: minutesAgo(60), method: "check", sentAt: daysAgo(1) },
      // contract EST "Bathroom remodel" $3,420: deposit invoiced and paid
      { id: "i5", number: "INV-0105", title: "Deposit", kind: "deposit", customerId: "c1", jobId: "j1", totalCents: 34200, paidCents: 34200, dueDate: daysAgo(8), paidAt: daysAgo(8), method: "card", sentAt: daysAgo(8) },
    ],
    payments: [
      { id: "pay3", invoiceId: "i3", customerId: "c1", amountCents: 24000, method: "zelle", at: minutesAgo(140), receiptNumber: "RCT-0103" },
      { id: "pay4", invoiceId: "i4", customerId: "c5", amountCents: 78000, method: "check", at: minutesAgo(60), receiptNumber: "RCT-0104", reference: "Check #1042" },
      { id: "pay5", invoiceId: "i5", customerId: "c1", amountCents: 34200, method: "card", at: daysAgo(8), receiptNumber: "RCT-0102" },
    ],
  };
}
