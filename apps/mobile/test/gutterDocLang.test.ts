/**
 * #2158 (founder 18.11: «Рабочий чертёж почему-то на русском… сохранилось всё на русском»; rule 7): a Gutters document is in
 * its reader's language, never the app's — the client's: the client's; the crew's: the company's (no team member's language
 * yet); the supplier's: en.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { gutterDocLang } from "../src/modules/gutters/docLang";
import type { DB } from "../src/data/types";

/** a measurement for nobody yet */
const NONE = { propertyId: null, leadId: null };
/** a company, a client with one property — enough for the language rule */
const base = (): DB =>
  ({
    company: { id: "co", name: "Co", docLanguage: "en" },
    customers: [{ id: "c1", name: "Ann", people: [] }],
    leads: [],
    properties: [{ id: "p1", customerId: "c1", address: "1 Main" }],
  }) as unknown as DB;

describe("unit:gutterDocLang — the reader's language (rule 7)", () => {
  it("the client's: the client's own language (es), whatever the app's", () => {
    const db = base();
    const c = db.customers[0];
    // the client's main person speaks Spanish (the client's language lives on its people)
    const withEs: DB = { ...db, customers: db.customers.map((x) => (x.id === c.id ? { ...x, people: [{ id: "pp1", name: "Ann", role: "main", phones: [], emails: [], language: "es" }] } : x)) } as DB;
    const prop = withEs.properties.find((p) => p.customerId === c.id)!;
    expect(gutterDocLang(withEs, { propertyId: prop.id, leadId: null }, "client")).toBe("es");
  });
  it("the crew's: the company's document language (en, es…), never ru by the app", () => {
    const db = base();
    expect(gutterDocLang({ ...db, company: { ...db.company!, docLanguage: "es" } }, NONE, "crew")).toBe("es");
    expect(gutterDocLang({ ...db, company: { ...db.company!, docLanguage: undefined } }, NONE, "crew")).toBe("en");
  });
  it("the supplier's: en (a US supplier), whatever the company's", () => {
    const db = base();
    expect(gutterDocLang({ ...db, company: { ...db.company!, docLanguage: "ru" } }, NONE, "supplier")).toBe("en");
  });
});
