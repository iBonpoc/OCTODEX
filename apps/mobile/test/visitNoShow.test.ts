/**
 * #2066 «Клиента нет дома» (docs/specs/03 §4.1, story map §5; server: public.visit_no_show, T407–T410).
 * С1 ДАНО the visit's own tech at the door (scheduled / en route / on site), КОГДА «Клиента нет дома», ТОГДА the visit closes
 *    with the reason; at work, signed or finished — no; another tech — no; the office — yes.
 * С2 ДАНО the job's only visit, ТОГДА the job waits for a date again — also from «in progress» that only this visit started;
 *    a job with another visit worked or open keeps its status.
 * С3 ДАНО a no-show, ТОГДА the office (director, dispatcher) gets one card «перенести выезд» for the job / lead — instead of
 *    «Запланировать» / «нет шага»; a tech sees none; the card goes when a new visit is booked.
 */
import { describe, expect, it } from "vitest";
import { attentionHref, buildAttention, noShowsToPlan } from "../src/features/attention";
import { canNoShow, mayMarkNoShow, noShowJobRollsBack } from "../src/features/schedule";
import { makeSeed } from "../src/data/seed";
import type { CancelledVisit, DB, Job, Visit, VisitStep } from "../src/data/types";

const visit = (id: string, over: Partial<Visit> = {}): Visit =>
  ({ id, jobId: "j2066", techId: "t1", assigneeIds: ["t1"], start: "2026-11-18T17:00:00.000Z", durationMin: 120, step: "on_site", scope: [], checklist: [], photos: [], amountDueCents: 0, ...over }) as Visit;

function db(visits: Visit[], job: Partial<Job> = {}, cancelled: CancelledVisit[] = []): DB {
  const d = makeSeed();
  const p = d.properties[0]!;
  d.jobs = [...d.jobs, { id: "j2066", title: "T2066", propertyId: p.id, status: "scheduled", amountCents: 50000, ...job } as Job];
  d.visits = [...d.visits.filter((v) => v.jobId !== "j2066"), ...visits];
  d.cancelledVisits = cancelled;
  return d;
}

describe("#2066 С1 who marks a no-show, and when", () => {
  it("at the door: scheduled, en route, on site — yes; at work, signed, finished — no", () => {
    const ok: VisitStep[] = ["scheduled", "en_route", "on_site"];
    for (const step of ok) expect(canNoShow(visit("v", { step })), step).toBe(true);
    for (const step of ["working", "signed", "paid", "done"] as VisitStep[]) expect(canNoShow(visit("v", { step })), step).toBe(false);
    expect(canNoShow(visit("v", { closed: true }))).toBe(false);
  });
  it("the visit's own tech, sales on their inspection, the office — yes; another tech — no", () => {
    const v = visit("v");
    expect(mayMarkNoShow("tech", "t1", v)).toBe(true);
    expect(mayMarkNoShow("tech", "t2", v)).toBe(false);
    expect(mayMarkNoShow("sales", "t1", v)).toBe(true);
    expect(mayMarkNoShow("sales", "s9", v)).toBe(false);
    expect(mayMarkNoShow("director", "x", v)).toBe(true);
    expect(mayMarkNoShow("dispatcher", "x", v)).toBe(true);
  });
});

describe("#2066 С2 the job after a no-show", () => {
  it("the only visit: the job waits for a date again (scheduled, and «in progress» this visit started)", () => {
    expect(noShowJobRollsBack(db([visit("nv1")]), "nv1")).toBe("j2066");
    expect(noShowJobRollsBack(db([visit("nv1")], { status: "in_progress" }), "nv1")).toBe("j2066");
  });
  it("another open visit, or another visit worked — the job keeps its status", () => {
    expect(noShowJobRollsBack(db([visit("nv1"), visit("nv2", { step: "scheduled" })]), "nv1")).toBeNull();
    expect(noShowJobRollsBack(db([visit("nv1"), visit("nv0", { step: "paid", closed: true })], { status: "in_progress" }), "nv1")).toBeNull();
    expect(noShowJobRollsBack(db([visit("nv1")], { status: "done" }), "nv1")).toBeNull();
  });
});

describe("#2066 С3 the office plans it again", () => {
  const gone = (over: Partial<CancelledVisit> = {}): CancelledVisit =>
    ({ ...visit("nv1"), cancelReason: "no_show", cancelText: "left a card", cancelledAt: "2026-11-18T18:00:00.000Z", ...over }) as CancelledVisit;
  it("one card for the job, instead of «Запланировать»; it opens the job's planning", () => {
    const d = db([], { status: "unscheduled" }, [gone()]);
    const items = buildAttention(d, "director");
    const mine = items.filter((i) => i.refId === "j2066");
    expect(mine.map((i) => i.kind)).toEqual(["visitNoShow"]);
    expect(mine[0]!.label).toBe("noShow.att");
    expect(mine[0]!.params.note).toBe("left a card");
    expect(attentionHref(mine[0]!)).toBe("/job/schedule?jobId=j2066");
    expect(buildAttention(d, "dispatcher").some((i) => i.kind === "visitNoShow")).toBe(true);
  });
  it("a tech and sales see none", () => {
    const d = db([], { status: "unscheduled" }, [gone()]);
    expect(buildAttention(d, "tech").some((i) => i.kind === "visitNoShow")).toBe(false);
    expect(buildAttention(d, "sales").some((i) => i.kind === "visitNoShow")).toBe(false);
  });
  it("a new visit booked, or the job closed — the card goes; an older no-show of the same job counts once", () => {
    expect(noShowsToPlan(db([visit("nv3", { step: "scheduled" })], { status: "scheduled" }, [gone()]))).toEqual([]);
    expect(noShowsToPlan(db([], { status: "done" }, [gone()]))).toEqual([]);
    const two = noShowsToPlan(db([], { status: "unscheduled" }, [gone({ id: "old", cancelledAt: "2026-11-10T18:00:00.000Z" }), gone()]));
    expect(two.map((v) => v.id)).toEqual(["nv1"]);
    // another reason (the client cancelled) is not this card
    expect(noShowsToPlan(db([], { status: "unscheduled" }, [gone({ cancelReason: "client_cancelled" })]))).toEqual([]);
  });
  it("an inspection's lead in contact: the no-show card is the lead's one card, it opens the lead", () => {
    const d = db([], {}, []);
    const lead = d.leads[0]!;
    d.leads = d.leads.map((l) => (l.id === lead.id ? { ...l, status: "replied", archivedAt: undefined } : l));
    d.visits = d.visits.filter((v) => v.leadId !== lead.id);
    d.cancelledVisits = [gone({ jobId: undefined, leadId: lead.id, kind: "inspection" })];
    const items = buildAttention(d, "director").filter((i) => i.refId === lead.id);
    expect(items.map((i) => i.kind)).toContain("visitNoShow");
    expect(items.some((i) => i.kind === "leadNoStep" || i.kind === "leadIdle")).toBe(false);
    expect(attentionHref(items.find((i) => i.kind === "visitNoShow")!)).toBe(`/lead/${lead.id}`);
  });
});
