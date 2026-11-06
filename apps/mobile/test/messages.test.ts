/**
 * Wave 6-3 «Сообщения» (docs/specs/20 «6-3»): threads by person, the client's language for the ready texts (rule 7 —
 * never the app's), US dates, no phone / email in the event, the op per subject, the technician's scope.
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
    }),
  },
}));
import { applyOp } from "../src/cloud/ops";
import { makeSeed } from "../src/data/seed";
import type { Activity, Customer, DB } from "../src/data/types";
import { callOp, contactRowId, messageNext, messageOp } from "../src/features/comms/contactEvents";
import {
  messageJobChoices, messageLanguage, messagePeople, messageSubject, messageTemplates, messageText, messageThread, messageThreads, threadKey, type MessageTemplate,
} from "../src/features/comms/messages";
import { DOC_LANGS } from "../src/i18n/translate";
import { setZone } from "../src/features/zone";

const NOW = Date.parse("2026-11-06T18:00:00Z");
const base = makeSeed();
const ids = { activityId: "act-m", statusId: "st-m", at: "2026-11-06T18:00:00Z" };

/** a client with two people: Ana speaks Spanish, Bob has no language; the company writes in English */
function world(): { d: DB; c: Customer } {
  const c: Customer = {
    ...base.customers[0]!, id: "cx", name: "Ana Lopez",
    people: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Ana Lopez", role: "main", language: "es", phones: [{ number: "(626) 555-0199", label: "mobile", primary: true }], emails: [{ address: "ana@example.com", primary: true }] },
      { id: "22222222-2222-4222-8222-222222222222", name: "Bob Lopez", role: "other", phones: [{ number: "(626) 555-0198", label: "mobile", primary: true }], emails: [] },
    ],
  };
  const d: DB = { ...base, customers: [c, ...base.customers.slice(1)], company: { ...base.company!, docLanguage: "en" } as DB["company"], activities: [] };
  return { d, c };
}

describe("messages: the client's language (rule 7)", () => {
  it("Ana reads Spanish whatever the app's language is; Bob — the client's main person's; the company's when nobody has one", () => {
    const { d, c } = world();
    expect(messageLanguage(d, { type: "customer", id: c.id }, c.people![0])).toBe("es");
    expect(messageLanguage(d, { type: "customer", id: c.id }, c.people![1])).toBe("es");
    const noLang: DB = { ...d, customers: d.customers.map((x) => (x.id === c.id ? { ...x, people: x.people!.map((p) => ({ ...p, language: undefined })) } : x)) };
    expect(messageLanguage(noLang, { type: "customer", id: c.id }, c.people![1])).toBe("en");
  });
  it("the text is in that language: es → Spanish, never the app's Russian", () => {
    const text = messageText("es", "onMyWay", {}, { firstName: "Ana", company: "Acme Gutters" });
    expect(text).toBe("Hola Ana, le escribe Acme Gutters. Voy en camino.");
    expect(text).not.toMatch(/[а-яё]/i);
  });
  it("every template exists in every client language, all placeholders filled", () => {
    const tpls: MessageTemplate[] = ["onMyWay", "visitReminder", "estimateSent", "thanksPayment"];
    for (const lang of DOC_LANGS)
      for (const tpl of tpls) {
        const s = messageText(lang, tpl, { date: "Nov 7, 2026", time: "9:00 AM", number: "EST-0001" }, { firstName: "Ana", company: "Acme" });
        expect(s.length).toBeGreaterThan(10);
        expect(s).not.toContain("{");
        expect(s).not.toContain("w6.msgc");
      }
    expect(messageText("es", "custom", {}, { firstName: "Ana", company: "Acme" })).toBe("");
  });
  it("a visit reminder carries a US date and time, also in Spanish", () => {
    setZone("America/Los_Angeles");
    const { d, c } = world();
    const job = { ...d.jobs[0]!, id: "jx", customerId: c.id };
    const visit = { ...d.visits[0]!, id: "vx", jobId: "jx", start: "2026-11-09T17:00:00Z", closed: false };
    const w: DB = { ...d, jobs: [job, ...d.jobs], visits: [visit, ...d.visits] };
    const r = messageTemplates(w, { type: "customer", id: c.id }, NOW).find((x) => x.id === "visitReminder")!;
    expect(r.params).toEqual({ date: "11/09/2026", time: "9:00 AM" });
    expect(messageText("es", "visitReminder", r.params, { firstName: "Ana", company: "Acme" })).toContain("el 11/09/2026 a las 9:00 AM");
  });
  it("no reminder without a coming visit; «Свой текст» is always there", () => {
    const { d, c } = world();
    const ids2 = messageTemplates({ ...d, visits: [] }, { type: "customer", id: c.id }, NOW).map((x) => x.id);
    expect(ids2).not.toContain("visitReminder");
    expect(ids2[0]).toBe("onMyWay");
    expect(ids2[ids2.length - 1]).toBe("custom");
  });
});

describe("messages: what is written", () => {
  const { d, c } = world();
  const ana = c.people![0]!;
  it("on a client: an sms event with the text only — never the phone or the address; op activity.message", async () => {
    const m = { subjectType: "customer" as const, subjectId: c.id, contactId: ana.id, channel: "sms" as const, text: " Hola Ana, voy en camino. " };
    const next = messageNext(d, m, ids);
    expect(next.activities[0]).toMatchObject({ id: "act-m", subjectType: "customer", subjectId: c.id, kind: "sms", direction: "out", contactId: ana.id, body: "Hola Ana, voy en camino." });
    const op = messageOp(d, m, ids);
    expect(op).toMatchObject({ k: "activity.message", channel: "sms", text: "Hola Ana, voy en camino.", contactId: ana.id });
    rows.length = 0;
    await applyOp(op, "co", "u");
    const row = rows[0]!.row;
    expect(row).toMatchObject({ kind: "sms", subject_type: "customer", direction: "out", body: "Hola Ana, voy en camino.", contact_id: ana.id });
    expect(JSON.stringify(row)).not.toContain("555-0199");
    expect(JSON.stringify(row)).not.toContain("ana@example.com");
  });
  it("an email on a job: op activity.message with channel email", () => {
    expect(messageOp(d, { subjectType: "job", subjectId: "j1", channel: "email", text: "Hi" }, ids)).toMatchObject({ k: "activity.message", subjectType: "job", channel: "email" });
  });
  it("on a lead: lead.touch (S2 as before) with the person (a contacts row of the lead) and the text", () => {
    const l0 = d.leads.find((x) => x.status === "new")!;
    const P = "33333333-3333-4333-8333-333333333333";
    const l = { ...l0, people: [{ id: P, name: "Lee", role: "main" as const, phones: [{ number: "(555) 555-0101", label: "mobile" as const, primary: true }], emails: [] }] };
    const w: DB = { ...d, leads: d.leads.map((x) => (x.id === l.id ? l : x)) };
    const op = messageOp(w, { subjectType: "lead", subjectId: l.id, contactId: P, channel: "sms", text: "Hi" }, ids);
    expect(op).toMatchObject({ k: "lead.touch", leadId: l.id, kind: "sms", contactId: P, note: "Hi" });
    const next = messageNext(w, { subjectType: "lead", subjectId: l.id, channel: "sms", text: "Hi" }, ids);
    expect(next.leads.find((x) => x.id === l.id)!.status).toBe("replied");
    expect(next.activities[0]).toMatchObject({ kind: "sms", body: "Hi" });
  });
  it("BLOCKER #227: a lead_contacts person (another table) is never contact_id — calls too; contact_id is always a contacts row", () => {
    const l0 = d.leads.find((x) => x.status === "new")!;
    const LC = "44444444-4444-4444-8444-444444444444";
    const l = { ...l0, people: undefined, contacts: [{ id: LC, name: "Neighbor", role: "other" as const, phone: "(555) 555-0102" }] };
    const w: DB = { ...d, leads: d.leads.map((x) => (x.id === l.id ? l : x)) };
    expect(contactRowId(w, LC)).toBeUndefined();
    expect((messageOp(w, { subjectType: "lead", subjectId: l.id, contactId: LC, channel: "sms", text: "Hi" }, ids) as { contactId?: string }).contactId).toBeUndefined();
    expect((callOp(w, { subjectType: "lead", subjectId: l.id, contactId: LC, outcome: "answered" }, ids) as { contactId?: string }).contactId).toBeUndefined();
    expect(messageNext(w, { subjectType: "lead", subjectId: l.id, contactId: LC, channel: "sms", text: "Hi" }, ids).activities[0]!.contactId).toBeUndefined();
    // an unknown uuid (not a person of any client or lead) — the same
    expect(contactRowId(w, "55555555-5555-4555-8555-555555555555")).toBeUndefined();
    // a person of a client is a contacts row
    expect(contactRowId(w, c.people![0]!.id)).toBe(c.people![0]!.id);
  });
  it("a made-up person (<id>-main) is never sent", () => {
    const op = messageOp(d, { subjectType: "customer", subjectId: c.id, contactId: `${c.id}-main`, channel: "sms", text: "Hi" }, ids) as { contactId?: string };
    expect(op.contactId).toBeUndefined();
  });
});

describe("messages: threads by person", () => {
  const { d, c } = world();
  const ana = c.people![0]!;
  const job = { ...d.jobs[0]!, id: "jx", customerId: c.id };
  const ev = (id: string, at: string, extra: Partial<Activity>): Activity => ({ id, subjectType: "customer", subjectId: c.id, kind: "sms", at, actorId: d.me, direction: "out", ...extra });
  const w: DB = {
    ...d,
    jobs: [job, ...d.jobs],
    activities: [
      ev("m1", "2026-11-06T10:00:00Z", { contactId: ana.id, body: "one" }),
      ev("m2", "2026-11-06T12:00:00Z", { subjectType: "job", subjectId: "jx", contactId: ana.id, kind: "email", body: "two" }),
      ev("m3", "2026-11-06T11:00:00Z", { body: "no person" }),
      ev("m4", "2026-11-06T09:00:00Z", { subjectType: "job", subjectId: "jx", body: "job, no person" }),
      ev("c1", "2026-11-06T13:00:00Z", { kind: "call" }),
    ],
  };
  it("Ana's SMS on the client and email on its job — one thread; without a person — the client's thread; calls stay out", () => {
    const th = messageThreads(w, "director");
    expect(th.map((x) => x.key)).toEqual([`p-${ana.id}`, `c-${c.id}`]);
    expect(th[0]!.items.map((x) => x.id)).toEqual(["m2", "m1"]);
    expect(th[0]!.title).toBe("Ana Lopez");
    expect(th[1]!.items.map((x) => x.id)).toEqual(["m3", "m4"]);
  });
  it("a lead with a client writes to the client's thread; a lead without — its own", () => {
    const l = { ...d.leads[0]!, customerId: undefined };
    expect(threadKey({ ...d, leads: [l] }, { subjectType: "lead", subjectId: l.id })).toBe(`l-${l.id}`);
    expect(threadKey({ ...d, leads: [{ ...l, customerId: c.id }] }, { subjectType: "lead", subjectId: l.id })).toBe(`c-${c.id}`);
    expect(threadKey(d, { subjectType: "customer", subjectId: c.id, contactId: `${c.id}-main` })).toBe(`c-${c.id}`);
  });
});

describe("messages: the technician (RLS activities_insert)", () => {
  const { d, c } = world();
  const visit = (id: string, jobId: string) => ({ ...d.visits[0]!, id, jobId, techId: "t-me", assigneeIds: ["t-me"], start: new Date(Date.now() + 86_400_000).toISOString(), closed: false });
  const w: DB = { ...d, me: "t-me", jobs: [{ ...d.jobs[0]!, id: "jx", customerId: c.id, status: "scheduled" }, ...d.jobs], visits: [visit("vx", "jx")], leads: d.leads.map((l) => ({ ...l, assigneeId: "someone", createdBy: "someone" })) };
  it("writes to the people of his visit's client, about his job — never on the client itself", () => {
    const people = messagePeople(w, "tech");
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((a) => a.owner.type === "customer" && a.owner.id === c.id)).toBe(true);
    expect(messageSubject(w, "tech", { type: "customer", id: c.id })).toEqual({ subjectType: "job", subjectId: "jx" });
    expect(messageSubject(w, "tech", { type: "customer", id: "not-his" })).toBeUndefined();
  });
  it("the office writes on the client", () => {
    expect(messageSubject(d, "dispatcher", { type: "customer", id: c.id })).toEqual({ subjectType: "customer", subjectId: c.id });
  });
});

describe("messages: #227 review", () => {
  const { d, c } = world();
  const visit = (id: string, jobId: string) => ({ ...d.visits[0]!, id, jobId, techId: "t-me", assigneeIds: ["t-me"], start: new Date(Date.now() + 86_400_000).toISOString(), closed: false });
  const other = { ...d.leads[0]!, id: "l-other", customerId: undefined, assigneeId: "someone", createdBy: "someone", people: [{ id: "66666666-6666-4666-8666-666666666666", name: "Other Lead", role: "main" as const, phones: [{ number: "(555) 555-0166", label: "mobile" as const, primary: true }], emails: [] }] };
  const w: DB = {
    ...d, me: "t-me",
    jobs: [{ ...d.jobs[0]!, id: "jx", customerId: c.id, status: "scheduled" }, { ...d.jobs[0]!, id: "jy", customerId: c.id, status: "scheduled" }, ...d.jobs],
    visits: [visit("vx", "jx"), visit("vy", "jy")],
    leads: [other, ...d.leads.map((l) => ({ ...l, assigneeId: "someone", createdBy: "someone" }))],
  };
  it("the technician: someone else's lead or client — no subject, an empty conversation without a name", () => {
    expect(messageSubject(w, "tech", { type: "lead", id: "l-other" })).toBeUndefined();
    expect(messageSubject(w, "tech", { type: "customer", id: base.customers[1]!.id })).toBeUndefined();
    const th = messageThread(w, "tech", `p-${other.people[0]!.id}`);
    expect(th).toEqual({ key: `p-${other.people[0]!.id}`, items: [], title: "" });
    expect(messageThread(w, "tech", "l-l-other").owner).toBeUndefined();
    expect(messagePeople(w, "tech").some((a) => a.owner.id === "l-other")).toBe(false);
  });
  it("two of his jobs at one client: no subject by itself, he picks one of them", () => {
    expect(messageSubject(w, "tech", { type: "customer", id: c.id })).toBeUndefined();
    expect(messageJobChoices(w, "tech", { type: "customer", id: c.id }).map((j) => j.id).sort()).toEqual(["jx", "jy"]);
    expect(messageJobChoices(d, "dispatcher", { type: "customer", id: c.id })).toEqual([]);
  });
  it("a job without a client keeps its own thread (never lost from the tab)", () => {
    const orphan: DB = { ...d, jobs: [{ ...d.jobs[0]!, id: "jz", customerId: undefined, propertyId: "no-such" } as never, ...d.jobs] };
    expect(threadKey(orphan, { subjectType: "job", subjectId: "jz" })).toBe("j-jz");
    const ev: Activity = { id: "mz", subjectType: "job", subjectId: "jz", kind: "sms", at: "2026-11-06T10:00:00Z", actorId: d.me, direction: "out", body: "hi" };
    expect(messageThreads({ ...orphan, activities: [ev] }, "director").map((x) => x.key)).toEqual(["j-jz"]);
  });
  it("the language through a lead: the lead's person → the lead's own language", () => {
    const l = { ...d.leads[0]!, id: "l-es", customerId: undefined, language: "es" as const, people: undefined };
    const wl: DB = { ...d, leads: [l, ...d.leads] };
    expect(messageLanguage(wl, { type: "lead", id: "l-es" })).toBe("es");
    const lp = { ...l, id: "l-ru", language: undefined, people: [{ id: "77777777-7777-4777-8777-777777777777", name: "Ivan", role: "main" as const, language: "ru" as const, phones: [], emails: [] }] };
    expect(messageLanguage({ ...d, leads: [lp, ...d.leads] }, { type: "lead", id: "l-ru" }, lp.people[0])).toBe("ru");
  });
});
