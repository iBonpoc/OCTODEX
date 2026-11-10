import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Lead } from "../src/data/types";
import {
  canSeeLead, defaultSourceId, filterLeads, findDuplicates, isOpenLead, leadTimeline, needsNextStep, nextStep, phoneKey, reasonsFor, sourceGroups, sourceInUse,
  waitingMinutes,
} from "../src/features/leads";
import { leadCols } from "../src/cloud/leadCols";

const NOW = Date.parse("2026-11-04T18:00:00Z");
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
function db(leads: Partial<Lead>[] = []): DB {
  const d = makeSeed();
  const base: Lead = { id: "x", name: "Test", phone: "(818) 555-0000", city: "LA", sourceId: "src-thumbtack", receivedAt: ago(10), message: "", status: "new" };
  return { ...d, leads: leads.map((l, i) => ({ ...base, id: `L${i}`, ...l })), tasks: [], activities: [] };
}

describe("leads: statuses and reasons", () => {
  it("lost = the client decided, declined = we decided; both closed", () => {
    expect(reasonsFor("lost")).toEqual(["no_response", "chose_competitor", "price_too_high", "not_ready_timing", "other"]);
    expect(reasonsFor("declined")).toContain("not_profitable");
    expect(reasonsFor("declined")).not.toContain("no_response");
    expect(isOpenLead({ status: "declined" } as Lead)).toBe(false);
    expect(isOpenLead({ status: "lost" } as Lead)).toBe(false);
    expect(isOpenLead({ status: "booked" } as Lead)).toBe(true);
  });
  it("one next step per status", () => {
    expect((["new", "replied", "booked", "estimate_sent", "won", "lost", "declined"] as const).map((s) => nextStep({ status: s } as Lead))).toEqual([
      "reply", "book", "estimate", "remind", null, null, null,
    ]);
  });
});

describe("leads: reply timer (around the clock)", () => {
  it("runs until the first response, stops after", () => {
    expect(waitingMinutes({ status: "new", receivedAt: ago(42) } as Lead, NOW)).toBe(42);
    expect(waitingMinutes({ status: "new", receivedAt: ago(42), firstResponseAt: ago(1) } as Lead, NOW)).toBeNull();
    expect(waitingMinutes({ status: "replied", receivedAt: ago(42) } as Lead, NOW)).toBeNull();
  });
});

describe("leads: duplicates", () => {
  it("phone formats match by the last 10 digits", () => {
    expect(phoneKey("+1 (818) 555-0170")).toBe(phoneKey("818.555.0170"));
  });
  it("existing client and recent / open leads are found; old closed leads are not", () => {
    const d = db([
      { phone: "(818) 555-0170", status: "new" },
      { phone: "818-555-0170", status: "lost", receivedAt: new Date(NOW - 60 * 86_400_000).toISOString() },
      { phone: "(999) 555-0000", email: "a@b.com", status: "won" },
    ]);
    d.customers = [...d.customers, { id: "cX", name: "Same Person", phone: "+1 818 555 0170", sourceId: "src-google", balanceCents: 0 }];
    const r = findDuplicates(d, { phone: "8185550170" }, undefined, NOW);
    expect(r.customers.map((c) => c.id)).toEqual(["cX"]);
    expect(r.leads.map((l) => l.id)).toEqual(["L0"]);
    expect(findDuplicates(d, { email: "A@B.com " }, undefined, NOW).leads.map((l) => l.id)).toEqual(["L2"]);
    expect(findDuplicates(d, { phone: "8185550170" }, "L0", NOW).leads).toEqual([]);
  });
});

describe("leads: who sees what, list filters", () => {
  const d = db([
    { status: "new", receivedAt: ago(5), assigneeId: "m-alex" },
    { status: "new", receivedAt: ago(50), assigneeId: "m-ivan" },
    { status: "replied", assigneeId: "m-alex", firstResponseAt: ago(1) },
    { status: "declined", lostReason: "not_profitable" },
    { status: "won" },
    { status: "replied", createdBy: "m-ivan" },
  ]);
  it("tech sees only leads assigned to him or created by him (same as RLS)", () => {
    const L = d.leads;
    expect(L.filter((l) => canSeeLead("tech", "m-ivan", l)).map((l) => l.id)).toEqual(["L1", "L5"]);
    expect(L.every((l) => canSeeLead("director", "m-alex", l))).toBe(true);
  });
  it("waiting first (longest wait on top), mine, closed", () => {
    expect(filterLeads(d, "director", { filter: "waiting" }, NOW).map((l) => l.id)).toEqual(["L1", "L0"]);
    expect(filterLeads(d, "director", { filter: "open" }, NOW).map((l) => l.id).slice(0, 2)).toEqual(["L1", "L0"]);
    expect(filterLeads(d, "director", { filter: "mine" }, NOW).map((l) => l.id).sort()).toEqual(["L0", "L2"]);
    expect(filterLeads(d, "director", { filter: "closed" }, NOW).map((l) => l.id)).toEqual(["L3"]);
    expect(filterLeads(d, "director", { filter: "won" }, NOW).map((l) => l.id)).toEqual(["L4"]);
  });
  it("search by phone digits, name, service", () => {
    const s = db([{ name: "Kevin", phone: "(818) 555-0170", service: "Water heater" }, { name: "Nina", phone: "(213) 555-0191" }]);
    expect(filterLeads(s, "director", { filter: "open", q: "0170" }, NOW).map((l) => l.name)).toEqual(["Kevin"]);
    expect(filterLeads(s, "director", { filter: "open", q: "heater" }, NOW).map((l) => l.name)).toEqual(["Kevin"]);
    expect(filterLeads(s, "director", { filter: "open", q: "nin" }, NOW).map((l) => l.name)).toEqual(["Nina"]);
  });
});

describe("leads: next step is required", () => {
  it("an open lead after the first reply needs a task or an estimate visit", () => {
    const d = db([{ status: "replied" }, { status: "booked" }, { status: "new" }]);
    expect(needsNextStep(d, d.leads[0]!)).toBe(true);
    expect(needsNextStep(d, d.leads[1]!)).toBe(false); // estimate visit booked
    expect(needsNextStep(d, d.leads[2]!)).toBe(false); // the timer handles new leads
    d.tasks = [{ id: "t", subjectType: "lead", subjectId: "L0", title: "Call back" }];
    expect(needsNextStep(d, d.leads[0]!)).toBe(false);
    d.tasks = [{ id: "t", subjectType: "lead", subjectId: "L0", title: "Call back", doneAt: ago(1) }];
    expect(needsNextStep(d, d.leads[0]!)).toBe(true);
  });
});

describe("sources", () => {
  it("grouped marketplace → ads → person → own; hidden ones disappear unless chosen", () => {
    const d = makeSeed();
    expect(sourceGroups(d).map((g) => g.kind)).toEqual(["marketplace", "ads", "person", "own"]);
    d.sources = d.sources.map((s) => (s.id === "src-angi" ? { ...s, active: false } : s));
    expect(sourceGroups(d).flatMap((g) => g.items).some((s) => s.id === "src-angi")).toBe(false);
    expect(sourceGroups(d, "src-angi").flatMap((g) => g.items).some((s) => s.id === "src-angi")).toBe(true);
  });
  it("a source with leads or clients is in use (hide, not delete)", () => {
    const d = makeSeed();
    expect(sourceInUse(d, "src-thumbtack")).toBe(true);
    expect(sourceInUse(d, "src-angi")).toBe(false);
  });
});

describe("history", () => {
  it("received, contact, status, notes and estimate events in time order (newest first)", () => {
    const d = db([{ id: "L", receivedAt: ago(100), message: "Leaking pipe" }]);
    d.leads[0]!.id = "L";
    d.activities = [
      { id: "a1", subjectType: "lead", subjectId: "L", kind: "call", at: ago(90), actorId: "m-alex" },
      { id: "a2", subjectType: "lead", subjectId: "L", kind: "status", meta: { from: "new", to: "replied" }, at: ago(90), actorId: "m-alex" },
      { id: "a3", subjectType: "lead", subjectId: "L", kind: "status", meta: { from: "replied", to: "declined", reason: "not_profitable" }, at: ago(5), actorId: "m-alex" },
    ];
    d.notes = [
      { id: "n1", subjectType: "lead", subjectId: "L", body: "Asked for Saturday", visibility: "team", pinned: false, authorId: "m-alex", at: ago(30) },
      { id: "n2", subjectType: "lead", subjectId: "L", body: "secret", visibility: "private", pinned: false, authorId: "m-ivan", at: ago(20) },
    ];
    const tl = leadTimeline(d, d.leads[0]!, "m-alex");
    expect(tl.map((e) => e.key)).toEqual(["tl.closed", "tl.note", "tl.call", "tl.status", "tl.received"]);
    expect(tl[0]!.params).toMatchObject({ reason: "lead.reason.not_profitable" });
    expect(tl.some((e) => e.body === "secret")).toBe(false); // someone else's private note
  });
  it("a repeat request from outside (kind intake, spec 34) is its own line with the person's words", () => {
    const d = db([{ id: "L", receivedAt: ago(100) }]);
    d.leads[0]!.id = "L";
    d.activities = [{ id: "i1", subjectType: "lead", subjectId: "L", kind: "intake", direction: "in", body: "also the downspouts", at: ago(10), actorId: "", meta: { unconfirmed: "1" } }];
    const tl = leadTimeline(d, d.leads[0]!, "m-alex");
    expect(tl[0]).toMatchObject({ key: "tl.intake", icon: "inbox", body: "also the downspouts" });
  });
});

describe("lead fields → database columns", () => {
  it("maps names and keeps the one-line address", () => {
    expect(leadCols({ phone2: "(626) 555-0101", phone2Label: "home", preferredContact: "sms", budgetCents: 150000, assigneeId: "u1" })).toEqual({
      phone2: "(626) 555-0101", phone2_label: "home", preferred_contact: "sms", budget_cents: 150000, assigned_to: "u1",
    });
    expect(leadCols({ address: "12 Elm St", zip: "91103" }, { city: "Glendale", state: "CA" })).toMatchObject({
      address_line1: "12 Elm St", address_zip: "91103", address_text: "12 Elm St, Glendale, CA 91103",
    });
    expect(leadCols({ service: "" })).toEqual({ service_requested: null });
    expect(leadCols({ name: "" })).toEqual({});
  });
});

describe("leads: the source a new lead starts with", () => {
  it("Thumbtack if the company has it active, else the first active one, else nothing", () => {
    const db = makeSeed();
    const thumb = db.sources.find((s) => s.name === "Thumbtack");
    expect(thumb).toBeTruthy();
    expect(defaultSourceId(db)).toBe(thumb!.id);
    const noThumb: DB = { ...db, sources: db.sources.map((s) => (s.name === "Thumbtack" ? { ...s, active: false } : s)) };
    expect(defaultSourceId(noThumb)).toBe(noThumb.sources.find((s) => s.active)!.id);
  });
  it("nothing while the sources are not loaded yet (the form takes them when they arrive)", () => {
    expect(defaultSourceId({ ...makeSeed(), sources: [] })).toBe("");
  });
});
