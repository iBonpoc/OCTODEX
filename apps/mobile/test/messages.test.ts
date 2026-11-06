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
import { messageNext, messageOp } from "../src/features/comms/contactEvents";
import {
  messageLanguage, messagePeople, messageSubject, messageTemplates, messageText, messageThreads, threadKey, type MessageTemplate,
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
    const op = messageOp(m, ids);
    expect(op).toMatchObject({ k: "activity.message", channel: "sms", text: "Hola Ana, voy en camino.", contactId: ana.id });
    rows.length = 0;
    await applyOp(op, "co", "u");
    const row = rows[0]!.row;
    expect(row).toMatchObject({ kind: "sms", subject_type: "customer", direction: "out", body: "Hola Ana, voy en camino.", contact_id: ana.id });
    expect(JSON.stringify(row)).not.toContain("555-0199");
    expect(JSON.stringify(row)).not.toContain("ana@example.com");
  });
  it("an email on a job: op activity.message with channel email", () => {
    expect(messageOp({ subjectType: "job", subjectId: "j1", channel: "email", text: "Hi" }, ids)).toMatchObject({ k: "activity.message", subjectType: "job", channel: "email" });
  });
  it("on a lead: lead.touch (S2 as before) with the person and the text", () => {
    const l = d.leads.find((x) => x.status === "new")!;
    const op = messageOp({ subjectType: "lead", subjectId: l.id, contactId: "33333333-3333-4333-8333-333333333333", channel: "sms", text: "Hi" }, ids);
    expect(op).toMatchObject({ k: "lead.touch", leadId: l.id, kind: "sms", contactId: "33333333-3333-4333-8333-333333333333", note: "Hi" });
    const next = messageNext(d, { subjectType: "lead", subjectId: l.id, channel: "sms", text: "Hi" }, ids);
    expect(next.leads.find((x) => x.id === l.id)!.status).toBe("replied");
    expect(next.activities[0]).toMatchObject({ kind: "sms", body: "Hi" });
  });
  it("a made-up person (<id>-main) is never sent", () => {
    const op = messageOp({ subjectType: "customer", subjectId: c.id, contactId: `${c.id}-main`, channel: "sms", text: "Hi" }, ids) as { contactId?: string };
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
