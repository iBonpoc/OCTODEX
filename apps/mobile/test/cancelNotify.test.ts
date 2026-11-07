// «Сообщить клиенту?» after a cancel (docs/specs/03 §13, S4a / S9a): the text is in the CLIENT's language, read
// from `cancelledVisits`, and the event goes to the lead / job / client.
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { CancelledVisit, DB } from "../src/data/types";
import { cancelNotice, cancelledVisitOf } from "../src/features/cancelNotify";

function cancel(d: DB, id: string): DB {
  const v = d.visits.find((x) => x.id === id)!;
  const c: CancelledVisit = { ...v, cancelReason: "client_cancelled", cancelledAt: "2026-11-05T10:00:00Z" };
  return { ...d, visits: d.visits.filter((x) => x.id !== id), cancelledVisits: [...(d.cancelledVisits ?? []), c] };
}
const seed = () => structuredClone(makeSeed()) as unknown as DB;

describe("cancelNotice", () => {
  it("finds the visit only after it was cancelled (it has left visits)", () => {
    const d = seed();
    expect(cancelNotice(d, "v1")).toBeNull();
    const c = cancel(d, "v1");
    expect(cancelledVisitOf(c, "v1")?.id).toBe("v1");
    expect(cancelNotice(c, "v1")).not.toBeNull();
    expect(cancelNotice(c, "nope")).toBeNull();
  });

  it("a job visit: the job is the subject, the text names the work visit, en-US date and time", () => {
    const d = cancel(seed(), "v1");
    const n = cancelNotice(d, "v1")!;
    expect(n.subject).toEqual({ subjectType: "job", subjectId: "j1" });
    expect(n.text).toMatch(/work visit on .+ at \d{1,2}:\d{2}\s?(AM|PM) is cancelled/);
    expect(n.text).toContain(d.company!.name);
  });

  it("the CLIENT's language, not the app's: a Spanish client gets Spanish", () => {
    const d = seed();
    const j = d.jobs.find((x) => x.id === "j1")!;
    const p = d.properties.find((x) => x.id === j.propertyId)!;
    // the client's language is its main person's (docLanguageFor)
    d.customers = d.customers.map((c) => (c.id === p.customerId ? { ...c, people: [{ id: "pp1", name: c.name, role: "main", phones: [{ number: "(626) 555-0142", label: "mobile", primary: true }], emails: [], language: "es" }] } : c));
    const n = cancelNotice(cancel(d, "v1"), "v1")!;
    expect(n.text).toMatch(/^Hola .+visita de trabajo .+ está cancelada/);
  });

  it("an inspection of a lead: the lead is the subject and gets the inspection text", () => {
    const d = seed();
    d.visits = d.visits.map((v) => (v.id === "v6" ? { ...v, leadId: "l1" } : v));
    const n = cancelNotice(cancel(d, "v6"), "v6")!;
    expect(n.subject).toEqual({ subjectType: "lead", subjectId: "l1" });
    expect(n.text).toContain("estimate visit");
  });

  it("an inspection at a client's property without a lead: the client is the subject", () => {
    const d = seed();
    const n = cancelNotice(cancel(d, "v6"), "v6")!;
    const p = d.properties.find((x) => x.id === "p7")!;
    expect(n.subject).toEqual({ subjectType: "customer", subjectId: p.customerId });
    expect(n.phone).toBeTruthy();
  });

  it("«Весь день»: the date only, no hour", () => {
    const d = seed();
    d.visits = d.visits.map((v) => (v.id === "v1" ? { ...v, allDay: true } : v));
    const n = cancelNotice(cancel(d, "v1"), "v1")!;
    expect(n.text).not.toMatch(/\d:\d{2}/);
    expect(n.text).toContain("new day");
  });
});
