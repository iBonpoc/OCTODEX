/** The language of what goes to a client (founder's rule 05.11.2026, docs/specs/07 §2.1): person → client → lead → company → en. */
import { describe, expect, it } from "vitest";
import { docLanguageFor } from "../src/data/people";
import { tFor, translate } from "../src/i18n/translate";
import { makeSeed } from "../src/data/seed";
import type { DB, Lead } from "../src/data/types";

const db = (): DB => {
  const d = makeSeed();
  d.company = d.company ? { ...d.company, docLanguage: undefined } : d.company;
  return d;
};
const lead = (p: Partial<Lead>): Lead =>
  ({ id: "Lq", name: "Rosa Diaz", phone: "(818) 555-0101", city: "Pasadena", sourceId: "s", receivedAt: "2026-11-05T10:00:00Z", message: "", status: "new", ...p }) as Lead;

describe("docLanguageFor", () => {
  it("nothing known: English (US company default)", () => {
    const d = db();
    d.leads = [lead({})];
    expect(docLanguageFor(d, { leadId: "Lq" })).toBe("en");
  });
  it("the company default applies when the client's own is not known", () => {
    const d = db();
    d.company = { ...d.company!, docLanguage: "es" };
    d.leads = [lead({})];
    expect(docLanguageFor(d, { leadId: "Lq" })).toBe("es");
  });
  it("the lead's language beats the company's; the main person's beats the old lead field", () => {
    const d = db();
    d.company = { ...d.company!, docLanguage: "en" };
    d.leads = [lead({ language: "es" })];
    expect(docLanguageFor(d, { leadId: "Lq" })).toBe("es");
    d.leads = [lead({ language: "es", people: [{ id: "p1", name: "Rosa Diaz", role: "main", phones: [], emails: [], language: "en" }] })];
    expect(docLanguageFor(d, { leadId: "Lq" })).toBe("en");
  });
  it("a client's main person decides for the client; a lead with a client follows the client", () => {
    const d = db();
    const c = d.customers.find((x) => x.id === "c1")!;
    d.customers = d.customers.map((x) => (x.id === c.id ? { ...x, people: [{ id: "m", name: c.name, role: "main", phones: [], emails: [], language: "es" }, { id: "t", name: "Tenant", role: "tenant", phones: [], emails: [], language: "en" }] } : x));
    d.leads = [lead({ customerId: c.id, language: "en" })];
    expect(docLanguageFor(d, { customerId: c.id })).toBe("es");
    expect(docLanguageFor(d, { leadId: "Lq" })).toBe("es");
    expect(docLanguageFor(d, { customerId: c.id, personId: "t" })).toBe("en"); // a message to the tenant
  });
});

describe("tFor: a client's language, not the app's", () => {
  it("translates into the asked language with parameters", () => {
    expect(tFor("es")("co.docLanguage")).toBe(translate("es", "co.docLanguage"));
    expect(tFor("en")("co.docLanguage")).toBe("Language of client documents");
    expect(translate("en", "lead.prefers", { way: "SMS" })).toContain("SMS");
  });
});

describe("every app language × every client language (founder's decision В11: en, es, ru)", () => {
  const UI = ["ru", "en", "es"] as const;
  const CLIENT = ["en", "es", "ru"] as const;
  // a text that differs in all three languages
  const KEY = "co.docLanguage" as const;
  for (const ui of UI)
    for (const client of CLIENT)
      it(`app in ${ui}, client reads ${client}: what goes to the client is in ${client}`, () => {
        const d = db();
        d.company = { ...d.company!, docLanguage: "en" };
        d.leads = [lead({ people: [{ id: "p1", name: "Rosa Diaz", role: "main", phones: [], emails: [], language: client }] })];
        const lang = docLanguageFor(d, { leadId: "Lq" });
        expect(lang).toBe(client);
        const out = tFor(lang)(KEY);
        expect(out).toBe(translate(client, KEY));
        if (ui !== client) expect(out).not.toBe(translate(ui, KEY));
      });
  it("the three texts really differ", () => {
    expect(new Set(CLIENT.map((l) => translate(l, KEY))).size).toBe(3);
  });
});
