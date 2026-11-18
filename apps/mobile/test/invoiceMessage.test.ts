/**
 * #2017 — the message to the client about an invoice (docs/15-story-map.md §7 п.9: scenarios, the test carries the number).
 * С1 ДАНО the company filled in no payment method, КОГДА the office sends an invoice (or a reminder), ТОГДА the text has no
 *    «How to pay: —» line; with Zelle / «checks payable to» the line is there as before.
 * С2 ДАНО an invoice of a job of a signed estimate, КОГДА it is sent, ТОГДА the text carries the client page link (/p/<token>),
 *    where the client sees and pays it; an invoice without an estimate, with a revoked link, of another client's estimate
 *    or of an unsigned one — no link.
 * С3 ДАНО a client in es (or en, ru), КОГДА the invoice is sent, ТОГДА the text and the link line are in the client's language.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { invoiceMessage, invoicePageToken } from "../src/features/docPdf";
import { reminderMessage } from "../src/features/invoiceRemind";
import { translate, DOC_LANGS } from "../src/i18n/translate";
import { makeSeed } from "../src/data/seed";
import type { DB, Invoice } from "../src/data/types";

const company = { name: "Acme", contacts: [], licenses: [] } as never;
const inv = { id: "i1", number: "INV-0001", totalCents: 50000, paidCents: 0, dueDate: "2026-11-20", jobId: "j2017", customerId: "c1", kind: "final" } as unknown as Invoice;

type Est = { token?: string; linkRevokedAt?: string; customerId?: string; status?: string };
function db(payment?: { zelle?: string; checkPayableTo?: string }, estimate?: Est): DB {
  const d = makeSeed();
  d.company = d.company ? { ...d.company, payment: payment ?? {} } : d.company;
  d.jobs = [...d.jobs, { id: "j2017", estimateId: estimate ? "e2017" : undefined } as never];
  d.estimates = estimate ? [...d.estimates, { id: "e2017", customerId: "c1", status: "approved", ...estimate } as never] : d.estimates;
  return d;
}

describe("#2017 the invoice message", () => {
  it("С1 no payment method: no «How to pay» line, no dash — in every client language", () => {
    for (const lang of DOC_LANGS) {
      const m = invoiceMessage(db(), inv, company, lang);
      const how = translate(lang, "inv.sendText").split("{how}")[0]!.split(".").pop()!.trim();
      expect(m.text, lang).not.toContain("—");
      expect(m.text, lang).not.toContain(how);
      expect(m.text, lang).toContain("INV-0001");
    }
    const r = reminderMessage(db(), inv, "Acme", "en", Date.parse("2026-11-18T12:00:00Z"));
    expect(r.text).not.toContain("How to pay");
  });
  it("С1 with Zelle: the line is there as before", () => {
    const m = invoiceMessage(db({ zelle: "pay@acme.test" }), inv, company, "en");
    expect(m.text).toContain("How to pay: Zelle pay@acme.test");
  });
  it("С2 an invoice of a signed estimate's job: the client page link; without an estimate or revoked — none", () => {
    expect(invoicePageToken(db(undefined, { token: "tok123" }), inv)).toBe("tok123");
    expect(invoicePageToken(db(), inv)).toBeUndefined();
    expect(invoicePageToken(db(undefined, { token: "tok123", linkRevokedAt: "2026-11-01T00:00:00Z" }), inv)).toBeUndefined();
    expect(invoicePageToken(db(undefined, { token: "tok123", status: "awaiting_countersign" }), inv)).toBe("tok123");
    expect(invoicePageToken(db(undefined, { token: "tok123", customerId: "c-other" }), inv), "another client's estimate").toBeUndefined();
    for (const status of ["draft", "sent", "declined"]) expect(invoicePageToken(db(undefined, { token: "tok123", status }), inv), status).toBeUndefined();
    const m = invoiceMessage(db(), inv, company, "en", "https://example.test/p/tok123");
    expect(m.text).toContain("View and pay: https://example.test/p/tok123");
    expect(invoiceMessage(db(), inv, company, "en").text).not.toContain("/p/");
  });
  it("С3 the client's language: es text and es link line", () => {
    const m = invoiceMessage(db({ zelle: "pay@acme.test" }), inv, company, "es", "https://example.test/p/tok123");
    expect(m.text).toContain("factura INV-0001");
    expect(m.text).toContain("Cómo pagar: Zelle pay@acme.test");
    expect(m.text).toContain("Ver y pagar: https://example.test/p/tok123");
    expect(invoiceMessage(db(), inv, company, "es").text).not.toContain("Cómo pagar");
  });
  it("С1–С3 the reminder: no «How to pay» without methods, the link line, in the client's language (due and overdue)", () => {
    const link = "https://example.test/p/tok123";
    for (const now of [Date.parse("2026-11-18T20:00:00Z"), Date.parse("2026-11-25T20:00:00Z")]) {
      const es = reminderMessage(db(), inv, "Acme", "es", now, link);
      expect(es.text).toContain("INV-0001");
      expect(es.text).not.toContain("Cómo pagar");
      expect(es.text).not.toContain(": —");
      expect(es.text).toContain(`Ver y pagar: ${link}`);
      expect(es.text).not.toBe(reminderMessage(db(), inv, "Acme", "en", now, link).text);
      expect(reminderMessage(db({ zelle: "pay@acme.test" }), inv, "Acme", "en", now).text).toContain("How to pay: Zelle pay@acme.test");
    }
    expect(reminderMessage(db(), inv, "Acme", "es", Date.parse("2026-11-18T20:00:00Z")).text)
      .not.toBe(reminderMessage(db(), inv, "Acme", "es", Date.parse("2026-11-25T20:00:00Z")).text);
  });
});
