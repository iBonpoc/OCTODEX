/**
 * Wave 6-2 «Звонки» (docs/specs/20 §3, §5, §8): a call always has its outcome (the server counts a call without one as
 * answered — a new lead would move to «replied» by itself); the columns it is written with; where a role may write it;
 * the person and minutes in the log.
 */
import { describe, expect, it, vi } from "vitest";

const rows: { table: string; row: Record<string, unknown> }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => {
        rows.push({ table, row });
        return { then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
      },
      insert: (row: Record<string, unknown>) => {
        rows.push({ table, row });
        return { then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
      },
    }),
  },
}));
import { applyOp, callCols } from "../src/cloud/ops";
import { makeSeed } from "../src/data/seed";
import type { useStore } from "../src/data/store";
import type { Activity, DB } from "../src/data/types";
import { callPlaceForClient, callPlaces, callPlacesAtClient, callReady, commsLog, peopleOfSubject, techVisitCounts } from "../src/features/comms/comms";
import { callNext, callOp, realPersonId } from "../src/features/comms/contactEvents";

type Api = ReturnType<typeof useStore>;

/**
 * The bug fixed in 6-2 (lead list and lead page): «Позвонить» wrote touchLead(id, "call") with no outcome. Now a call
 * does not compile without one — this function is type-checked by `tsc` in `npm run check` and never runs.
 */
function neverRuns(store: Api) {
  // @ts-expect-error — a call without an outcome: only callResult / logCall, which need one
  store.touchLead("l1", "call");
  // @ts-expect-error — logCall without an outcome
  store.logCall({ subjectType: "customer", subjectId: "c1" });
  store.touchLead("l1", "sms");
  store.callResult("l1", "no_answer");
  store.logCall({ subjectType: "customer", subjectId: "c1", outcome: "answered", durationMin: 4 });
}
void neverRuns;

describe("calls: what is written", () => {
  it("a call: direction out, the outcome and minutes in meta, the person, the note as the body", () => {
    expect(callCols({ at: "2026-11-06T10:00:00Z", outcome: "answered", durationMin: 7.4, contactId: "p1", note: "  Wants a quote  " })).toEqual({
      direction: "out", at: "2026-11-06T10:00:00Z", meta: { outcome: "answered", duration_min: "7" }, contact_id: "p1", body: "Wants a quote",
    });
  });
  it("no minutes, no person, no note: only what there is", () => {
    expect(callCols({ at: "t", outcome: "no_answer", durationMin: 0, note: " " })).toEqual({ direction: "out", at: "t", meta: { outcome: "no_answer" } });
  });
  it("a call on a client goes to activities with its outcome; on a lead too (lead.touch)", async () => {
    rows.length = 0;
    await applyOp({ k: "activity.call", activityId: "a1", subjectType: "customer", subjectId: "c1", at: "t", outcome: "voicemail", durationMin: 2 }, "co", "u");
    await applyOp({ k: "lead.touch", activityId: "a2", leadId: "l1", kind: "call", at: "t", outcome: "no_answer", contactId: "p9" }, "co", "u");
    const [a, b] = rows.map((r) => r.row);
    expect(rows.every((r) => r.table === "activities")).toBe(true);
    expect(a).toMatchObject({ id: "a1", company_id: "co", subject_type: "customer", subject_id: "c1", kind: "call", direction: "out", meta: { outcome: "voicemail", duration_min: "2" } });
    expect(b).toMatchObject({ id: "a2", subject_type: "lead", subject_id: "l1", kind: "call", meta: { outcome: "no_answer" }, contact_id: "p9" });
  });
  it("an SMS has no outcome", async () => {
    rows.length = 0;
    await applyOp({ k: "lead.touch", activityId: "a3", leadId: "l1", kind: "sms", at: "t" }, "co", "u");
    expect(rows[0]!.row.meta).toEqual({});
  });
  it("not ready without an outcome or without «к чему»", () => {
    expect(callReady({ subjectType: "customer", subjectId: "c1" })).toBe(false);
    expect(callReady({ subjectType: "customer", outcome: "answered" })).toBe(false);
    expect(callReady({ subjectType: "customer", subjectId: "c1", outcome: "answered" })).toBe(true);
    expect(callReady({ subjectType: "customer", subjectId: "c1", outcome: "maybe" as never })).toBe(false);
  });
});

describe("calls: where a role may write one (RLS activities_insert)", () => {
  const d = makeSeed();
  const me = d.visits.find((v) => v.techId)!.techId!;
  const tech: DB = { ...d, me };
  it("the office: leads without a client and clients", () => {
    const kinds = new Set(callPlaces(d, "dispatcher").map((x) => x.subjectType));
    expect([...kinds].sort()).toEqual(["customer", "lead"]);
  });
  it("the technician: the jobs of his visits and his leads — never a client", () => {
    const places = callPlaces(tech, "tech");
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((x) => x.subjectType === "job" || x.subjectType === "lead")).toBe(true);
    expect(callPlaces({ ...d, me: "nobody" }, "tech").filter((x) => x.subjectType === "job")).toEqual([]);
  });
  it("«Позвонить» on a client: the office writes on the client; the technician on his one job there, or picks", () => {
    const c = d.customers[0]!;
    expect(callPlaceForClient(d, "director", c.id)).toEqual({ subjectType: "customer", subjectId: c.id });
    // an explicit world: client X has one job with the tech's visit tomorrow; client Y has two
    const v0 = d.visits[0]!;
    const job = (id: string, customerId: string) => ({ ...d.jobs[0]!, id, customerId, status: "scheduled" as const });
    const visit = (id: string, jobId: string) => ({ ...v0, id, jobId, techId: "t-me", assigneeIds: ["t-me"], start: new Date(Date.now() + 86_400_000).toISOString(), closed: false });
    const w: DB = { ...d, me: "t-me", jobs: [job("jx", "cx"), job("jy1", "cy"), job("jy2", "cy")], visits: [visit("vx", "jx"), visit("vy1", "jy1"), visit("vy2", "jy2")] };
    expect(callPlaceForClient(w, "tech", "cx")).toEqual({ subjectType: "job", subjectId: "jx" });
    expect(callPlaceForClient(w, "tech", "cy")).toBeUndefined();
    expect(callPlaceForClient(w, "tech", "not-his")).toBeUndefined();
  });
  it("«Позвонить» on a client with two of his jobs: «к чему» = those jobs and his leads there, nothing else (20 §6-4)", () => {
    const v0 = d.visits[0]!;
    const job = (id: string, customerId: string) => ({ ...d.jobs[0]!, id, customerId, status: "scheduled" as const });
    const visit = (id: string, jobId: string) => ({ ...v0, id, jobId, techId: "t-me", assigneeIds: ["t-me"], start: new Date(Date.now() + 86_400_000).toISOString(), closed: false });
    const lead = (id: string, customerId: string | undefined, assigneeId: string) => ({ ...d.leads[0]!, id, name: `Lead ${id}`, customerId, assigneeId, createdBy: "office" });
    const w: DB = {
      ...d, me: "t-me",
      jobs: [job("jx", "cx"), job("jy1", "cy"), job("jy2", "cy")],
      visits: [visit("vx", "jx"), visit("vy1", "jy1"), visit("vy2", "jy2")],
      leads: [lead("ly", "cy", "t-me"), lead("lx", "cx", "t-me"), lead("lo", "cy", "someone")],
    };
    const at = callPlacesAtClient(w, "tech", "cy").map((x) => `${x.subjectType}:${x.subjectId}`);
    expect(at).toEqual(["job:jy1", "job:jy2", "lead:ly"]);
    expect(callPlaces(w, "tech").length).toBeGreaterThan(at.length); // before: the whole list of his
    expect(callPlacesAtClient(w, "director", "cy")).toEqual([]); // the office writes on the client itself
    expect(callPlacesAtClient(w, "tech", "not-his")).toEqual([]);
  });
  it("the technician's window = the server's tech_visit_counts: not old, not a no-show, not a done or cancelled job", () => {
    const v0 = d.visits[0]!;
    const base = { ...v0, id: "v", jobId: "j", techId: "t-me", assigneeIds: ["t-me"], start: new Date().toISOString(), closed: false };
    const w = { me: "t-me", jobs: [{ ...d.jobs[0]!, id: "j", status: "scheduled" as const }] };
    expect(techVisitCounts(w, base)).toBe(true);
    expect(techVisitCounts(w, { ...base, start: new Date(Date.now() - 20 * 86_400_000).toISOString() })).toBe(false);
    expect(techVisitCounts(w, { ...base, start: new Date(Date.now() - 10 * 86_400_000).toISOString() })).toBe(true);
    expect(techVisitCounts(w, { ...base, closed: true, step: "arrived" as never })).toBe(false);
    expect(techVisitCounts({ ...w, jobs: [] }, base)).toBe(false);
    expect(techVisitCounts({ ...w, jobs: [{ ...w.jobs[0]!, status: "done" as const }] }, base)).toBe(false);
    expect(techVisitCounts(w, { ...base, techId: "other", assigneeIds: ["other"] })).toBe(false);
  });
  it("the people of a job are its client's", () => {
    const job = d.jobs[0]!;
    const cid = job.customerId ?? d.properties.find((p) => p.id === job.propertyId)!.customerId!;
    expect(peopleOfSubject(d, "job", job.id).map((p) => p.id)).toEqual(peopleOfSubject(d, "customer", cid).map((p) => p.id));
    expect(peopleOfSubject(d, "job", "gone")).toEqual([]);
  });
});

describe("calls: the log", () => {
  it("shows the person, the minutes and the note", () => {
    const d = makeSeed();
    const c = d.customers[0]!;
    const person = peopleOfSubject(d, "customer", c.id)[0]!;
    const a: Activity = { id: "k1", subjectType: "customer", subjectId: c.id, kind: "call", at: "2026-11-06T10:00:00Z", actorId: d.me, contactId: person.id, body: "Call back Monday", meta: { outcome: "answered", duration_min: "6" } };
    const [e] = commsLog({ ...d, activities: [a] }, "director", "calls");
    expect(e).toMatchObject({ id: "k1", who: c.name, person: person.name, durationMin: 6, note: "Call back Monday", outcome: "answered", href: `/client/${c.id}` });
  });
});

describe("calls: what the store does (callNext / callOp — the store wraps them in mutate)", () => {
  const d = makeSeed();
  const ids = { activityId: "act-1", statusId: "st-1", at: "2026-11-06T10:00:00Z" };
  const l = d.leads.find((x) => x.status === "new")!;
  it("a client: one call event, op activity.call", () => {
    const c = d.customers[0]!;
    const input = { subjectType: "customer" as const, subjectId: c.id, outcome: "answered" as const, durationMin: 3 };
    const next = callNext(d, input, ids);
    expect(next.activities[0]).toMatchObject({ id: "act-1", subjectType: "customer", subjectId: c.id, kind: "call", direction: "out", meta: { outcome: "answered", duration_min: "3" } });
    expect(next.activities.length).toBe(d.activities.length + 1);
    expect(callOp(d, input, ids)).toMatchObject({ k: "activity.call", activityId: "act-1", subjectType: "customer", subjectId: c.id, outcome: "answered" });
  });
  it("a job: op activity.call on the job", () => {
    const j = d.jobs[0]!;
    expect(callOp(d, { subjectType: "job", subjectId: j.id, outcome: "voicemail" }, ids)).toMatchObject({ k: "activity.call", subjectType: "job", subjectId: j.id });
  });
  it("a lead: op lead.touch with the outcome; «Поговорили» moves a new lead to replied (S2), «Не ответил» counts an attempt", () => {
    expect(callOp(d, { subjectType: "lead", subjectId: l.id, outcome: "no_answer" }, ids)).toMatchObject({ k: "lead.touch", leadId: l.id, kind: "call", outcome: "no_answer" });
    const missed = callNext(d, { subjectType: "lead", subjectId: l.id, outcome: "no_answer" }, ids);
    expect(missed.leads.find((x) => x.id === l.id)).toMatchObject({ status: "new", callAttempts: (l.callAttempts ?? 0) + 1 });
    const got = callNext(d, { subjectType: "lead", subjectId: l.id, outcome: "answered" }, ids);
    expect(got.leads.find((x) => x.id === l.id)).toMatchObject({ status: "replied", callAttempts: 0 });
    expect(got.activities.slice(0, 2).map((a) => a.kind)).toEqual(["call", "status"]);
  });
  it("«Отменить» = the store keeps the old database: callNext never changes its input", () => {
    const before = JSON.stringify(d);
    callNext(d, { subjectType: "lead", subjectId: l.id, outcome: "answered" }, ids);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("a made-up person (<id>-main) never leaves the phone: not in the op, not as contact_id", () => {
    const c = d.customers[0]!;
    const input = { subjectType: "customer" as const, subjectId: c.id, outcome: "answered" as const, contactId: `${c.id}-main` };
    expect(realPersonId(`${c.id}-main`)).toBeUndefined();
    expect(realPersonId("4b1f0c4e-1111-4222-8333-444455556666")).toBe("4b1f0c4e-1111-4222-8333-444455556666");
    expect(callOp(d, input, ids)).not.toHaveProperty("contactId", `${c.id}-main`);
    expect((callOp(d, input, ids) as { contactId?: string }).contactId).toBeUndefined();
    expect(callNext(d, input, ids).activities[0]!.contactId).toBeUndefined();
    expect((callOp(d, { subjectType: "lead", subjectId: l.id, outcome: "no_answer", contactId: `${l.id}-main` }, ids) as { contactId?: string }).contactId).toBeUndefined();
    expect(callCols({ at: "t", outcome: "answered", contactId: "c9-main" })).not.toHaveProperty("contact_id");
  });
});
