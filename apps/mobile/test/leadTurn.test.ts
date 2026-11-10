/** Leads wave L1 rules (docs/14-leads-spec.md §3.2, §6.1, §13 Р8–Р13): whose turn, snooze, settings, what is missing. */
import { afterAll, describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Lead } from "../src/data/types";
import { filterLeads, isBackFromSnooze, isSnoozed, leadTurn, missingForEstimate, waitStatus } from "../src/features/leads";
import { LEAD_SETTINGS_DEFAULT, leadSettingsOf } from "../src/features/leadSettings";
import { buildAttention } from "../src/features/attention";

const NOW = Date.parse("2026-11-04T18:00:00Z");
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();
const days = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const base: Lead = { id: "L", name: "Test Lead", phone: "(818) 555-0000", city: "LA", sourceId: "src-thumbtack", receivedAt: min(10), message: "", status: "new" };
function db(l: Partial<Lead>, extra: Partial<DB> = {}): { d: DB; l: Lead } {
  const d0 = makeSeed();
  const lead = { ...base, ...l };
  return { d: { ...d0, leads: [lead], tasks: [], estimates: [], activities: [], ...extra }, l: lead };
}

describe("settings", () => {
  it("defaults: 5 / 15 min, remind after 3 days, lost-or-wait 14 days after the reminder", () => {
    expect(leadSettingsOf(null)).toEqual(LEAD_SETTINGS_DEFAULT);
    expect(LEAD_SETTINGS_DEFAULT).toMatchObject({ replyWarnMin: 5, replyBadMin: 15, remindDays: 3, lostOrWaitDays: 14, waitMoreDays: 7 });
  });
  it("company values win; junk is ignored; red never before yellow", () => {
    const st = leadSettingsOf({ leadSettings: { replyWarnMin: 10, replyBadMin: 3, remindDays: -1 as unknown as number, repeatOnlyInBusinessHours: false } });
    expect(st.replyWarnMin).toBe(10);
    expect(st.replyBadMin).toBe(10);
    expect(st.remindDays).toBe(3);
    expect(st.repeatOnlyInBusinessHours).toBe(false);
  });
  it("reply colour follows the settings", () => {
    expect(waitStatus(4)).toBe("info");
    expect(waitStatus(5)).toBe("warn");
    expect(waitStatus(15)).toBe("bad");
    expect(waitStatus(9, { ...LEAD_SETTINGS_DEFAULT, replyWarnMin: 10, replyBadMin: 30 })).toBe("info");
  });
});

describe("whose turn", () => {
  it("new lead: reply, minutes and unanswered call attempts", () => {
    const { d, l } = db({ receivedAt: min(12), callAttempts: 2 });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toEqual({ kind: "reply", minutes: 12, attempts: 2, status: "warn" });
  });
  it("in touch with an open task: step; overdue task is red, today's is info, later is neutral", () => {
    const task = (dueAt: string) => ({ id: "t", subjectType: "lead" as const, subjectId: "L", title: "Call back", dueAt });
    const r = (dueAt: string) => {
      const { d, l } = db({ status: "replied" }, { tasks: [task(dueAt)] });
      return leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW);
    };
    expect(r(days(2))).toMatchObject({ kind: "step", status: "bad" });
    expect(r(new Date(NOW + 60 * 60_000).toISOString())).toMatchObject({ kind: "step", status: "info" });
    expect(r(new Date(NOW + 3 * 86_400_000).toISOString())).toMatchObject({ kind: "step", status: "neutral", title: "Call back" });
  });
  it("booked estimate visit counts as a step", () => {
    const { d, l } = db({ status: "booked" });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW).kind).toBe("step");
  });
  it("in touch, nothing planned: no step", () => {
    const { d, l } = db({ status: "replied" });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toEqual({ kind: "noStep", status: "warn" });
  });
  it("estimate sent: wait → remind after 3 days → lost or wait 14 days after the reminder", () => {
    const at = (l: Partial<Lead>) => {
      const x = db({ status: "estimate_sent", ...l });
      return leadTurn(x.d, x.l, LEAD_SETTINGS_DEFAULT, NOW);
    };
    expect(at({ lastOutboundAt: days(1) })).toMatchObject({ kind: "wait", action: "none", days: 1, status: "neutral" });
    expect(at({ lastOutboundAt: days(3) })).toMatchObject({ kind: "wait", action: "remind", status: "warn" });
    expect(at({ lastOutboundAt: days(10), remindedAt: days(5) })).toMatchObject({ kind: "wait", action: "none" });
    expect(at({ lastOutboundAt: days(20), remindedAt: days(14) })).toMatchObject({ kind: "wait", action: "lostOrWait", status: "warn" });
    // "wait 7 more days" silences the question until then
    expect(at({ lastOutboundAt: days(20), remindedAt: days(14), askAgainAt: new Date(NOW + 7 * 86_400_000).toISOString() })).toMatchObject({ action: "none" });
  });
  it("the client wrote last: reply again, counted from their message", () => {
    const { d, l } = db({ status: "replied", lastOutboundAt: min(120), lastInboundAt: min(20) });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "reply", minutes: 20, status: "bad" });
  });
  it("closed leads have no turn", () => {
    for (const status of ["won", "lost", "declined"] as const) {
      const { d, l } = db({ status });
      expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW).kind).toBe("done");
    }
  });
});

describe("review findings of wave L1", () => {
  const act = (kind: "call" | "sms", at: string) => ({ id: `a-${kind}-${at}`, subjectType: "lead" as const, subjectId: "L", kind, at, actorId: "m-alex" });
  it("'wait 7 more days' asks again after 7 days, not 14", () => {
    const { d, l } = db({ status: "estimate_sent", lastOutboundAt: days(30), remindedAt: days(21), askAgainAt: days(0.1) });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "wait", action: "lostOrWait" });
  });
  it("silence is not counted while the lead was snoozed; it comes back as 'back from snooze'", () => {
    const { d, l } = db({ status: "estimate_sent", lastOutboundAt: days(100), snoozedUntil: days(1), lastActivityAt: days(100) });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "wait", days: 1, action: "none" });
    expect(buildAttention(d).find((a) => a.refId === "L")?.kind).toBe("leadBack");
  });
  it("a revised estimate after a reminder starts the wait over instead of asking 'lost or wait?'", () => {
    const est = { id: "e", customerId: "c", propertyId: "p", title: "Revised", totalCents: 1, status: "sent" as const, leadId: "L", sentAt: min(30) };
    const { d, l } = db({ status: "estimate_sent", lastOutboundAt: min(30), remindedAt: days(20) }, { estimates: [est] });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "wait", action: "none", days: 0 });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW + 3 * 86_400_000)).toMatchObject({ action: "remind" });
  });
  it("booked: a past estimate visit with no estimate becomes overdue; a future one is calm", () => {
    const d0 = makeSeed();
    // an inspection: a visit of the lead at the property, no job (docs/specs/03 §3.1)
    const visit = (start: string) => ({ ...d0.visits[0]!, id: "vx", jobId: undefined, leadId: "L", propertyId: "px", kind: "inspection" as const, start });
    const r = (start: string) => {
      const { d, l } = db({ status: "booked", propertyId: "px" }, { jobs: [], visits: [visit(start)] });
      return leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW);
    };
    expect(r(days(10))).toMatchObject({ kind: "step", status: "bad" });
    expect(r(min(120))).toMatchObject({ kind: "step", status: "warn" });
    expect(r(new Date(NOW + 2 * 86_400_000).toISOString())).toMatchObject({ kind: "step", status: "neutral" });
  });
  // #603: one rule with «Осмотр прошёл — сметы нет» (attention.ts, inspectionsNoEstimate): overdue from the start of business
  // on the N-th working day (inspectionNoEstimateDays) after the inspection ended, in the COMPANY's zone — not 24 h
  describe("booked: overdue by the company's working days, whatever the phone's zone (#603)", () => {
    const d0 = makeSeed();
    const insp = (start: string, durationMin = 60) => ({ ...d0.visits[0]!, id: "vx", jobId: undefined, leadId: "L", propertyId: "px", kind: "inspection" as const, start, durationMin, step: "scheduled" as const });
    const turn = (tz: string, start: string, now: number) => {
      const { d, l } = db({ status: "booked", propertyId: "px" }, { jobs: [], visits: [insp(start)], company: { ...d0.company!, timezone: tz } });
      return leadTurn(d, l, LEAD_SETTINGS_DEFAULT, now).status;
    };
    const machine = process.env.TZ;
    afterAll(() => { if (machine === undefined) delete process.env.TZ; else process.env.TZ = machine; });
    for (const phone of ["UTC", "Pacific/Honolulu", "Asia/Tokyo", "America/New_York", "America/Los_Angeles"]) {
      it(`phone in ${phone}`, () => {
        process.env.TZ = phone;
        // LA company: Tue 11-03 9:00 PM – 10:00 PM. Next working day Wed 11-04 opens 8:00 AM LA = 16:00Z
        const lateTue = "2026-11-04T05:00:00.000Z";
        expect(turn("America/Los_Angeles", lateTue, Date.parse("2026-11-04T15:59:00Z"))).toBe("warn");
        // 13 h after the start (the old 24 h rule said «not yet»): the next working morning has come → overdue
        expect(turn("America/Los_Angeles", lateTue, Date.parse("2026-11-04T16:00:00Z"))).toBe("bad");
        // the same inspection in a New York company ended Wed 1:00 AM ET: its next working morning is Thu 8:00 AM ET (13:00Z)
        expect(turn("America/New_York", lateTue, Date.parse("2026-11-04T16:00:00Z"))).toBe("warn");
        expect(turn("America/New_York", lateTue, Date.parse("2026-11-05T13:00:00Z"))).toBe("bad");
        // Saturday inspection, Sunday closed: overdue only on Monday morning (8:00 AM LA = 16:00Z), 40 h later
        const sat = "2026-11-07T18:00:00.000Z"; // Sat 10:00 AM LA
        expect(turn("America/Los_Angeles", sat, Date.parse("2026-11-09T15:00:00Z"))).toBe("warn");
        expect(turn("America/Los_Angeles", sat, Date.parse("2026-11-09T16:00:00Z"))).toBe("bad");
        // the lead card and «Требует внимания» agree: the card goes red exactly when the attention item appears
        const atAttention = (now: number) => {
          const { d } = db({ status: "booked", propertyId: "px" }, { jobs: [], visits: [insp(sat)], company: { ...d0.company!, timezone: "America/Los_Angeles" } });
          return buildAttention(d, "director", now).some((a) => a.kind === "inspectionNoEstimate" && a.refId === "L");
        };
        expect(atAttention(Date.parse("2026-11-09T15:00:00Z"))).toBe(false);
        expect(atAttention(Date.parse("2026-11-09T16:00:00Z"))).toBe(true);
      });
    }
  });
  it("in touch: after an SMS we wait for the client; after a real conversation we need a step", () => {
    const sms = db({ status: "replied", lastOutboundAt: min(60) }, { activities: [act("sms", min(60))] });
    expect(leadTurn(sms.d, sms.l, LEAD_SETTINGS_DEFAULT, NOW).kind).toBe("wait");
    const call = db({ status: "replied", lastOutboundAt: min(60) }, { activities: [act("call", min(60))] });
    expect(leadTurn(call.d, call.l, LEAD_SETTINGS_DEFAULT, NOW).kind).toBe("noStep");
  });
  it("a planned estimate visit is the step for any open lead (also after the estimate went out)", () => {
    const d0 = makeSeed();
    const visit = { ...d0.visits[0]!, id: "vx", jobId: undefined, leadId: "L", propertyId: "px", kind: "inspection" as const, start: new Date(NOW + 2 * 86_400_000).toISOString() };
    const { d, l } = db({ status: "estimate_sent", propertyId: "px", lastOutboundAt: days(10) }, { jobs: [], visits: [visit] });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "step", status: "neutral" });
  });
  it("a task due earlier today is overdue", () => {
    const { d, l } = db({ status: "replied" }, { tasks: [{ id: "t", subjectType: "lead", subjectId: "L", title: "Call at 9", dueAt: min(120) }] });
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toMatchObject({ kind: "step", status: "bad" });
  });
});

describe("snooze (not a status)", () => {
  it("hidden from open lists until the date, shown under 'Snoozed', keeps its funnel status", () => {
    const until = new Date(NOW + 90 * 86_400_000).toISOString();
    const { d, l } = db({ status: "estimate_sent", snoozedUntil: until });
    expect(isSnoozed(l, NOW)).toBe(true);
    expect(leadTurn(d, l, LEAD_SETTINGS_DEFAULT, NOW)).toEqual({ kind: "snoozed", until, status: "neutral" });
    expect(filterLeads(d, "director", { filter: "open" }, NOW)).toHaveLength(0);
    expect(filterLeads(d, "director", { filter: "snoozed" }, NOW).map((x) => x.id)).toEqual(["L"]);
    expect(l.status).toBe("estimate_sent");
  });
  it("comes back on the date and asks for attention until someone touches it", () => {
    const { l } = db({ status: "replied", snoozedUntil: days(1), lastActivityAt: days(30) });
    expect(isSnoozed(l, NOW)).toBe(false);
    expect(isBackFromSnooze(l, NOW)).toBe(true);
    expect(isBackFromSnooze({ ...l, lastActivityAt: min(5) }, NOW)).toBe(false);
  });
  it("a closed lead is never snoozed", () => {
    expect(isSnoozed({ ...base, status: "lost", snoozedUntil: new Date(NOW + 86_400_000).toISOString() }, NOW)).toBe(false);
  });
});

describe("attention uses whose turn", () => {
  it("snoozed leads do not ask for attention; a tech sees only own leads", () => {
    const d = makeSeed();
    const l1 = d.leads.find((l) => l.id === "l1")!;
    expect(buildAttention(d).some((a) => a.refId === "l1")).toBe(true);
    l1.snoozedUntil = new Date(Date.now() + 86_400_000).toISOString();
    expect(buildAttention(d).some((a) => a.refId === "l1")).toBe(false);
    l1.snoozedUntil = undefined;
    l1.assigneeId = "someone-else";
    l1.createdBy = "someone-else";
    expect(buildAttention(d, "tech").some((a) => a.refId === "l1")).toBe(false);
  });
});

describe("what is missing for an estimate", () => {
  it("lists phone, email, address, ZIP and the request", () => {
    expect(missingForEstimate({ ...base, phone: "", message: "" })).toEqual(["phone", "email", "address", "zip", "request"]);
    expect(missingForEstimate({ ...base, email: "a@b.co", address: "1 Elm St", zip: "91001", service: "Gutter cleaning" })).toEqual([]);
    expect(missingForEstimate({ ...base, email: "a@b.co", address: "1 Elm St", zip: "9100", message: "leaky roof" })).toEqual(["zip"]);
  });
});
