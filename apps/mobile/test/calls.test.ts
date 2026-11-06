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
import { callPlaceForClient, callPlaces, callReady, commsLog, peopleOfSubject } from "../src/features/comms/comms";

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
    const job = tech.jobs.find((j) => tech.visits.some((v) => v.jobId === j.id && v.techId === me))!;
    const cid = job.customerId ?? tech.properties.find((p) => p.id === job.propertyId)!.customerId!;
    const jobsThere = callPlaces(tech, "tech").filter((x) => x.subjectType === "job" && (tech.jobs.find((j) => j.id === x.subjectId)?.customerId ?? tech.properties.find((p) => p.id === tech.jobs.find((j) => j.id === x.subjectId)?.propertyId)?.customerId) === cid);
    const got = callPlaceForClient(tech, "tech", cid);
    if (jobsThere.length === 1) expect(got).toEqual({ subjectType: "job", subjectId: jobsThere[0]!.subjectId });
    else expect(got).toBeUndefined();
    expect(callPlaceForClient(tech, "tech", "not-his")).toBeUndefined();
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
