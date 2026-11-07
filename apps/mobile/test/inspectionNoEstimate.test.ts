// «Осмотр прошёл — сметы нет» (docs/specs/03 §5.2, §13; S15): working days, who sees it, how it closes, one card per lead,
// the threshold setting (lead_settings, no migration — rule 16: an older build's save keeps the new key).
import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { inspectionsNoEstimate, workDaysAfter } from "../src/features/schedule";
import { BUSINESS_HOURS_DEFAULT, type BusinessHours } from "../src/features/scheduleSettings";
import { leadSettingsOf } from "../src/features/leadSettings";
import { companyFromDb, companyToDb } from "../src/cloud/companyMap";
import { makeSeed } from "../src/data/seed";
import type { DB, Estimate, Lead, Role, Visit } from "../src/data/types";

const LA = "America/Los_Angeles";
// Fri 6 Nov 2026 10:00 PST = 18:00Z; default hours Mon–Sat 8:00–18:00
const FRI_10 = "2026-11-06T18:00:00.000Z";
const SAT_8 = Date.parse("2026-11-07T16:00:00.000Z");
const MON_8 = Date.parse("2026-11-09T16:00:00.000Z");

describe("workDaysAfter", () => {
  it("Friday + 1 working day = Saturday 8:00 in the company's zone (Saturday works by default)", () => {
    expect(workDaysAfter(FRI_10, 1, BUSINESS_HOURS_DEFAULT, LA)).toBe(SAT_8);
  });
  it("closed days are skipped: Saturday + 1 = Monday 8:00", () => {
    expect(workDaysAfter("2026-11-07T18:00:00.000Z", 1, BUSINESS_HOURS_DEFAULT, LA)).toBe(MON_8);
  });
  it("the company's day, not UTC: Friday 11 PM in LA is still Friday", () => {
    // Fri 23:00 PST = Sat 07:00Z
    expect(workDaysAfter("2026-11-07T07:00:00.000Z", 1, BUSINESS_HOURS_DEFAULT, LA)).toBe(SAT_8);
  });
  it("N days and the company's own hours (Saturday off, Monday from 7:00)", () => {
    const h: BusinessHours = { ...BUSINESS_HOURS_DEFAULT, sat: null, mon: [420, 960] };
    expect(workDaysAfter(FRI_10, 1, h, LA)).toBe(Date.parse("2026-11-09T15:00:00.000Z"));
    expect(workDaysAfter(FRI_10, 2, h, LA)).toBe(Date.parse("2026-11-10T16:00:00.000Z"));
  });
  it("no working day at all: calendar days, never forever", () => {
    const none = Object.fromEntries(Object.keys(BUSINESS_HOURS_DEFAULT).map((d) => [d, null])) as BusinessHours;
    expect(workDaysAfter(FRI_10, 1, none, LA)).toBe(Date.parse("2026-11-07T08:00:00.000Z"));
  });
});

const base = () => structuredClone(makeSeed()) as unknown as DB;
const visit = (p: Partial<Visit>): Visit => ({ id: "vi", kind: "inspection", techId: "m-ivan", assigneeIds: ["m-ivan"], start: FRI_10, durationMin: 45, step: "done", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
function world(p: { lead?: Partial<Lead>; visits?: Visit[]; estimates?: Estimate[] } = {}): DB {
  const d = base();
  const l0 = d.leads.find((l) => l.id === "l2")!;
  const lead: Lead = { ...l0, status: "booked", snoozedUntil: undefined, archivedAt: undefined, ...p.lead };
  d.leads = [lead];
  d.visits = p.visits ?? [visit({ leadId: lead.id, propertyId: lead.propertyId })];
  d.estimates = p.estimates ?? [];
  d.company = { ...d.company!, timezone: LA, businessHours: BUSINESS_HOURS_DEFAULT };
  return d;
}
const items = (d: DB, now: number, role: Role = "director") => buildAttention(d, role, now).filter((i) => i.kind === "inspectionNoEstimate");

describe("unit:attention — «Осмотр прошёл — сметы нет»", () => {
  it("appears at the start of the next working day, not before", () => {
    const d = world();
    expect(items(d, SAT_8 - 60_000)).toHaveLength(0);
    const at = items(d, SAT_8);
    expect(at).toHaveLength(1);
    expect(at[0]).toMatchObject({ refId: "l2", status: "warn", label: "visitP2.att.noEstimate" });
  });
  it("the threshold comes from the company's lead settings (2 working days → Monday)", () => {
    const d = world();
    d.company = { ...d.company!, leadSettings: { inspectionNoEstimateDays: 2 } };
    expect(items(d, SAT_8)).toHaveLength(0);
    expect(items(d, MON_8)).toHaveLength(1);
  });
  it("«passed» = done, or the end is behind us; a visit still ahead — nothing", () => {
    expect(items(world({ visits: [visit({ leadId: "l2", step: "scheduled" })] }), SAT_8)).toHaveLength(1);
    expect(items(world({ visits: [visit({ leadId: "l2", step: "scheduled", start: "2026-11-08T18:00:00.000Z" })] }), SAT_8)).toHaveLength(0);
  });
  it("director, dispatcher and sales see it; a tech does not", () => {
    const d = world();
    for (const r of ["director", "dispatcher", "sales"] as const) expect(items(d, SAT_8, r), r).toHaveLength(1);
    expect(items(d, SAT_8, "tech")).toHaveLength(0);
  });
  it("closes: any estimate of the lead (a draft too), a new inspection planned, the lead closed / snoozed / archived", () => {
    const draft = { ...base().estimates[0]!, id: "e-new", leadId: "l2", status: "draft" } as Estimate;
    expect(items(world({ estimates: [draft] }), SAT_8)).toHaveLength(0);
    const again = visit({ id: "vi2", leadId: "l2", step: "scheduled", start: "2026-11-10T18:00:00.000Z" });
    expect(items(world({ visits: [visit({ leadId: "l2" }), again] }), SAT_8)).toHaveLength(0);
    expect(items(world({ lead: { status: "lost" } }), SAT_8)).toHaveLength(0);
    expect(items(world({ lead: { snoozedUntil: "2026-12-01T00:00:00.000Z" } }), SAT_8)).toHaveLength(0);
    expect(items(world({ lead: { archivedAt: "2026-11-06T00:00:00.000Z" } }), SAT_8)).toHaveLength(0);
  });
  it("one card per lead: a lead that already has its own card gets no second one", () => {
    // back from a snooze → «leadBack» is its card
    const d = world({ lead: { snoozedUntil: "2026-11-07T00:00:00.000Z" } });
    const all = buildAttention(d, "director", SAT_8).filter((i) => i.refId === "l2");
    expect(all).toHaveLength(1);
  });
  it("an inspection at a client's property without a lead: a card that opens the client; an estimate there closes it", () => {
    const d = world();
    d.leads = [];
    const p = d.properties.find((x) => x.id === "p7")!;
    d.visits = [visit({ propertyId: "p7" })];
    const it1 = items(d, SAT_8);
    expect(it1).toHaveLength(1);
    expect(it1[0]).toMatchObject({ refId: p.customerId, href: `/client/${p.customerId}` });
    d.estimates = [{ ...base().estimates[0]!, id: "e-p7", propertyId: "p7", customerId: p.customerId, status: "draft", leadId: undefined } as Estimate];
    expect(items(d, SAT_8)).toHaveLength(0);
    // an old estimate sent before the inspection does not count
    d.estimates = [{ ...d.estimates[0]!, status: "sent", sentAt: "2026-10-01T00:00:00.000Z" }];
    expect(items(d, SAT_8)).toHaveLength(1);
  });
  it("the finder itself: an inspection of a job (not an inspection) is never counted", () => {
    const d = world({ visits: [visit({ kind: undefined, jobId: "j1", leadId: undefined })] });
    expect(inspectionsNoEstimate(d, SAT_8, 1, BUSINESS_HOURS_DEFAULT, LA)).toHaveLength(0);
  });
});

describe("the setting (lead_settings.inspectionNoEstimateDays)", () => {
  it("default 1, kept between 1 and 10, junk ignored", () => {
    expect(leadSettingsOf(null).inspectionNoEstimateDays).toBe(1);
    expect(leadSettingsOf({ leadSettings: { inspectionNoEstimateDays: 0 } }).inspectionNoEstimateDays).toBe(1);
    expect(leadSettingsOf({ leadSettings: { inspectionNoEstimateDays: 40 } }).inspectionNoEstimateDays).toBe(10);
    expect(leadSettingsOf({ leadSettings: { inspectionNoEstimateDays: "3" as never } }).inspectionNoEstimateDays).toBe(1);
  });
  it("rule 16: an older build that does not know the key saves its lead settings — the stored key stays", () => {
    const stored = { id: "c1", name: "Co", lead_settings: { replyWarnMin: 10, inspectionNoEstimateDays: 3 } };
    // what an older build has on the phone: lead settings without the new key
    const old = { ...companyFromDb(stored, undefined, [], []), leadSettings: { replyWarnMin: 12 } };
    const out = companyToDb(old, stored) as { lead_settings: Record<string, unknown> };
    expect(out.lead_settings).toEqual({ replyWarnMin: 12, inspectionNoEstimateDays: 3 });
  });
});
