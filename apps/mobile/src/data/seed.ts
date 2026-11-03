/**
 * Test data (placeholder prices — founder rule: real prices are never typed into seeds).
 * All times are relative to "now" so the demo always looks like a live day in Los Angeles.
 */
import type { DB, ChecklistItem } from "./types";

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
const gutterChecklist = (prefix: string): ChecklistItem[] =>
  [
    "Inspect fascia for rot",
    "Slope 1/4″ per 10 ft",
    "Seal corners and end caps",
    "Hangers every 2 ft",
    "Water test downspouts",
    "Haul away old gutters",
  ].map((label, i) => ({ id: `${prefix}-c${i}`, label, done: false }));

export function makeSeed(): DB {
  return {
    me: "m-alex",
    members: [
      { id: "m-alex", name: "Alex Petrov", initials: "AP", kind: "employee", roles: ["director", "dispatcher", "tech"] },
      { id: "m-ivan", name: "Ivan Sokolov", initials: "IS", kind: "employee", roles: ["tech"] },
      { id: "m-dima", name: "Dmitry Orlov", initials: "DO", kind: "employee", roles: ["tech"] },
      { id: "m-sub", name: "Valley Gutters LLC", initials: "VG", kind: "sub", roles: ["tech"] },
    ],
    customers: [
      { id: "c1", name: "Sarah Mitchell", phone: "(626) 555-0142", email: "sarah.m@example.com", source: "Google", balanceCents: 0 },
      { id: "c2", name: "David Kim", phone: "(818) 555-0187", source: "Thumbtack", balanceCents: 184000 },
      { id: "c3", name: "Linda Alvarez", phone: "(310) 555-0110", email: "lalvarez@example.com", source: "Referral", balanceCents: 0 },
      { id: "c4", name: "Robert Chen", phone: "(323) 555-0166", source: "Yelp", balanceCents: 96000 },
      { id: "c5", name: "Maria Gonzalez", phone: "(562) 555-0133", source: "Website", balanceCents: 0 },
      { id: "c6", name: "James O'Connor", phone: "(424) 555-0199", source: "Google", balanceCents: 0 },
      { id: "c7", name: "Emily Park", phone: "(213) 555-0121", source: "Thumbtack", balanceCents: 0 },
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
      { id: "j1", propertyId: "p1", title: "Seamless 6″ K-style, 148 LF", status: "scheduled", amountCents: 342000 },
      { id: "j2", propertyId: "p2", title: "Gutter cleaning + guards", status: "scheduled", amountCents: 68000 },
      { id: "j3", propertyId: "p3", title: "Downspout repair (2)", status: "scheduled", amountCents: 42000 },
      { id: "j4", propertyId: "p4", title: "Seamless 5″ K-style, 96 LF", status: "done", amountCents: 96000 },
      { id: "j5", propertyId: "p5", title: "Gutter guards, 120 LF", status: "scheduled", amountCents: 156000 },
      { id: "j6", propertyId: "p6", title: "Box gutter replacement, 3 stories", status: "scheduled", amountCents: 518000 },
      { id: "j7", propertyId: "p7", title: "Estimate visit", status: "estimate", amountCents: 0 },
      { id: "j8", propertyId: "p1b", title: "Seasonal cleaning", status: "done", amountCents: 24000 },
    ],
    visits: [
      {
        id: "v1", jobId: "j1", techId: "m-alex", start: at(0, 8, 30), durationMin: 240, step: "scheduled",
        scope: ["Remove 148 LF old aluminum gutters", "Install 6″ seamless K-style, white", "4 downspouts 3×4″, 12 A-elbows"],
        checklist: gutterChecklist("v1"), photos: [], amountDueCents: 342000,
      },
      {
        id: "v2", jobId: "j2", techId: "m-alex", start: at(0, 13, 30), durationMin: 120, step: "scheduled",
        scope: ["Clean 160 LF gutters and flush downspouts", "Install mesh guards on rear side, 80 LF"],
        checklist: gutterChecklist("v2").slice(0, 4), photos: [], amountDueCents: 68000,
      },
      {
        id: "v3", jobId: "j3", techId: "m-alex", start: at(0, 16, 0), durationMin: 60, step: "scheduled",
        scope: ["Replace 2 damaged downspouts", "Re-seal outlet"],
        checklist: gutterChecklist("v3").slice(1, 4), photos: [], amountDueCents: 42000,
      },
      {
        id: "v4", jobId: "j5", techId: "m-ivan", start: at(0, 9, 0), durationMin: 180, step: "working",
        scope: ["Gutter guards 120 LF"], checklist: gutterChecklist("v4"), photos: [{ id: "ph1", kind: "before" }], amountDueCents: 156000,
      },
      {
        id: "v5", jobId: "j6", techId: "m-sub", start: at(0, 10, 0), durationMin: 360, step: "en_route", late: true,
        scope: ["Box gutter replacement"], checklist: gutterChecklist("v5"), photos: [], amountDueCents: 518000,
      },
      {
        id: "v6", jobId: "j7", techId: null, start: at(0, 15, 0), durationMin: 45, step: "scheduled",
        scope: ["Free estimate: front and back gutters, 2 stories"], checklist: [], photos: [], amountDueCents: 0,
      },
      {
        id: "v7", jobId: "j1", techId: "m-alex", start: at(1, 9, 0), durationMin: 90, step: "scheduled",
        scope: ["Final walkthrough and touch-up"], checklist: [], photos: [], amountDueCents: 0,
      },
    ],
    leads: [
      { id: "l1", name: "Kevin Brooks", phone: "(818) 555-0170", city: "Encino", source: "Thumbtack", receivedAt: minutesAgo(4), status: "new",
        message: "Need gutters replaced on a 2-story house, about 150 ft. Old ones are leaking at the corners." },
      { id: "l2", name: "Angela Rossi", phone: "(310) 555-0155", city: "Torrance", source: "Google", receivedAt: minutesAgo(22), status: "new",
        message: "Gutter cleaning before the rainy season. Single story." },
      { id: "l3", name: "Tom Becker", phone: "(626) 555-0108", city: "Arcadia", source: "Yelp", receivedAt: minutesAgo(95), status: "replied",
        message: "Quote for gutter guards?" },
      { id: "l4", name: "Nina Patel", phone: "(213) 555-0191", city: "Los Angeles", source: "Website", receivedAt: daysAgo(1), status: "booked",
        message: "Downspout is detached and water pools by the foundation." },
    ],
    estimates: [
      { id: "e1", customerId: "c6", propertyId: "p6", title: "Box gutters, 3 stories", totalCents: 518000, status: "approved", sentAt: daysAgo(6), approvedAt: minutesAgo(180) },
      { id: "e2", customerId: "c7", propertyId: "p7", title: "Seamless 6″, 130 LF", totalCents: 298000, status: "sent", sentAt: daysAgo(3) },
      { id: "e3", customerId: "c5", propertyId: "p5", title: "Gutter guards", totalCents: 156000, status: "approved", sentAt: daysAgo(9), approvedAt: daysAgo(4) },
      { id: "e4", customerId: "c3", propertyId: "p3", title: "Full replacement option", totalCents: 264000, status: "sent", sentAt: daysAgo(6) },
      { id: "e5", customerId: "c1", propertyId: "p1", title: "Seamless 6″, 148 LF", totalCents: 342000, status: "approved", sentAt: daysAgo(12), approvedAt: daysAgo(8) },
    ],
    expenses: [
      { id: "x1", jobId: "j5", vendor: "Home Depot", category: "materials", amountCents: 41260, at: minutesAgo(300), memberId: "m-ivan" },
      { id: "x2", jobId: "j1", vendor: "ABC Supply", category: "materials", amountCents: 88400, at: daysAgo(1), memberId: "m-alex" },
      { id: "x3", jobId: null, vendor: "Chevron", category: "fuel", amountCents: 7850, at: minutesAgo(200), memberId: "m-alex" },
    ],
    invoices: [
      { id: "i1", customerId: "c2", jobId: "j2", totalCents: 184000, paidCents: 0, dueDate: daysAgo(9) },
      { id: "i2", customerId: "c4", jobId: "j4", totalCents: 96000, paidCents: 0, dueDate: daysAgo(-3) },
      { id: "i3", customerId: "c1", jobId: "j8", totalCents: 24000, paidCents: 24000, dueDate: daysAgo(2), paidAt: minutesAgo(140) },
      { id: "i4", customerId: "c5", jobId: "j5", totalCents: 78000, paidCents: 78000, dueDate: daysAgo(0), paidAt: minutesAgo(60) },
    ],
  };
}
