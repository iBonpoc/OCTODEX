/** S20 «Напомнить» (wave 8): the text is in the CLIENT's language, US money and dates; the reminder is logged in the client's feed. */
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; row: Record<string, unknown> }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => {
        calls.push({ table, row });
        return { then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
      },
    }),
  },
}));
import { applyOp } from "../src/cloud/ops";
import { reminderMessage, remindersOf } from "../src/features/invoiceRemind";
import { setZone } from "../src/features/zone";
import type { Activity } from "../src/data/types";

afterEach(() => setZone("America/Los_Angeles"));
const db = { company: { payment: { zelle: "pay@acme.com", checkPayableTo: "Acme LLC" } } } as never;
const inv = { number: "INV-0101", totalCents: 184050, paidCents: 50, dueDate: "2026-10-27" };
const NOW = Date.parse("2026-11-06T00:30:00Z"); // Nov 5 in LA → 9 days past Oct 27

describe("reminder text — client's language", () => {
  it("es, overdue: days by the company's calendar, $ and US date", () => {
    setZone("America/Los_Angeles");
    const m = reminderMessage(db, inv, "Acme", "es", NOW);
    expect(m.text).toContain("tiene 9 días de atraso");
    expect(m.text).toContain("$1,840");
    expect(m.text).toContain("Zelle pay@acme.com");
    expect(m.text).toContain("Cheques a nombre de: Acme LLC");
    expect(m.subject).toBe("Recordatorio de pago INV-0101");
    expect(m.text).not.toMatch(/просроч|overdue|past due/);
  });
  it("en, not due yet: no «days late»", () => {
    setZone("America/Los_Angeles");
    const m = reminderMessage(db, { ...inv, dueDate: "2026-11-10" }, "Acme", "en", NOW);
    expect(m.text).toMatch(/^Acme: a friendly reminder about invoice INV-0101 — balance \$1,840, due /);
    expect(m.text).not.toContain("past due");
  });
  it("ru; no payment details → «—»", () => {
    const m = reminderMessage({ company: null } as never, inv, "Acme", "ru", NOW);
    expect(m.text).toContain("просрочен на 9 дн");
    expect(m.text).toContain("Как оплатить: —");
  });
});

describe("reminders of an invoice", () => {
  it("only reminders of this invoice, newest first", () => {
    const a = (id: string, at: string, meta?: Record<string, string>, subjectType: Activity["subjectType"] = "customer"): Activity => ({ id, subjectType, subjectId: "c", kind: "sms", at, actorId: "m", meta });
    const acts = [a("1", "2026-11-01", { invoiceId: "i1", reminder: "1" }), a("2", "2026-11-03", { invoiceId: "i1", reminder: "1" }), a("3", "2026-11-04", { invoiceId: "i2", reminder: "1" }), a("4", "2026-11-05", { invoiceId: "i1" }), a("5", "2026-11-05", { invoiceId: "i1", reminder: "1" }, "lead")];
    expect(remindersOf({ activities: acts }, "i1").map((x) => x.id)).toEqual(["2", "1"]);
  });
});

describe("ops: invoice.remind", () => {
  it("an outgoing event in the client's feed, linked to the invoice (no migration)", async () => {
    calls.splice(0);
    await applyOp({ k: "invoice.remind", activityId: "a1", customerId: "c1", invoiceId: "i1", channel: "email", at: "2026-11-05T18:00:00Z" }, "co", "u");
    expect(calls).toEqual([
      { table: "activities", row: { id: "a1", company_id: "co", subject_type: "customer", subject_id: "c1", kind: "email", direction: "out", at: "2026-11-05T18:00:00Z", meta: { invoiceId: "i1", reminder: "1" } } },
    ]);
  });
});
