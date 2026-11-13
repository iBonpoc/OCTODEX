/**
 * unit:estimateTerms — #1304 (docs/specs/40 §4, §7): the default Terms by the client's language, a new estimate, a change of
 * the client, what the client reads; the company row both ways (rule 16, step 1); normalizeDoc. Test data.
 * The same inputs as the db test T205 (supabase/tests/core_rls.sql): the server's portal gives the same Terms.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { makeSeed } from "../src/data/seed";
import type { Company, DB, EstimateDoc } from "../src/data/types";
import { cleanTerms, syncCompanyTerms, TERMS_MAX, termsByLangFrom, termsDefault, termsForClient, termsForNew, termsOnClientChange } from "../src/features/estimateTerms";
import { companyFromDb, companyToDb } from "../src/cloud/companyMap";
import { normalizeDoc, DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import { fromRaw } from "../src/cloud/portal";
import { estimateHtml } from "../src/features/estimatePdf";

const EN = "Warranty: 1 year on labor (test).";
const ES = "Garantía: 1 año de mano de obra (prueba).";
const co = (estimate: Partial<Company["estimate"]>): Pick<Company, "estimate"> => ({ estimate: { validDays: 7, depositBps: 1000, ...estimate } });

function seed(langs: { customer?: "en" | "es" | "ru"; company?: "en" | "es" | "ru" } = {}): DB {
  const d = structuredClone(makeSeed()) as unknown as DB;
  d.company = { ...d.company!, docLanguage: langs.company ?? "en", estimate: { ...d.company!.estimate, termsByLang: { en: EN, es: ES } } };
  const c = d.customers[0]!;
  if (langs.customer) d.customers = d.customers.map((x) => (x.id === c.id ? { ...x, people: [{ id: "pp1", name: x.name, role: "main", phones: [], emails: [], language: langs.customer }] } : x));
  return d;
}

describe("unit:estimateTerms — the default by language (#1304)", () => {
  it("the client's language → en → the old single text → nothing; a blank one does not count", () => {
    expect(termsDefault(co({ termsByLang: { en: EN, es: ES } }), "es")).toBe(ES);
    expect(termsDefault(co({ termsByLang: { en: EN, es: ES } }), "ru")).toBe(EN);
    expect(termsDefault(co({ termsByLang: { en: EN, ru: "   " } }), "ru")).toBe(EN);
    expect(termsDefault(co({ terms: "Old terms (test)" }), "es")).toBe("Old terms (test)");
    expect(termsDefault(co({ termsByLang: { es: ES } }), "en")).toBe("");
    expect(termsDefault(co({}), "en")).toBe("");
    expect(termsDefault(null, "en")).toBe("");
  });
  it("a new estimate: the language of the client's main person (no person argument — as the server's estimate_doc_language)", () => {
    const d = seed({ customer: "es" });
    expect(termsForNew(d, { customerId: d.customers[0]!.id })).toEqual({ text: ES, lang: "es" });
    // a client without a language of its own → the company's language; ru has no text → en
    const d2 = seed({ company: "ru" });
    expect(termsForNew(d2, { customerId: d2.customers[0]!.id })).toEqual({ text: EN, lang: "ru" });
  });
  it("a lead without a client: the lead's language", () => {
    const d = seed();
    const lead = { ...d.leads[0]!, customerId: undefined, language: "es" as const, people: [] };
    d.leads = [lead, ...d.leads.slice(1)];
    expect(termsForNew(d, { leadId: lead.id }).text).toBe(ES);
  });
  it("the client changed: the untouched default follows the new language, an edited text stays, none yet — the new one", () => {
    const d = seed({ customer: "es" });
    const es = { customerId: d.customers[0]!.id };
    const en = { customerId: d.customers[1]!.id };
    expect(termsOnClientChange(d, ES, es, en)).toBe(EN);
    expect(termsOnClientChange(d, ES + " Edited.", es, en)).toBe(ES + " Edited.");
    expect(termsOnClientChange(d, "", es, en)).toBe("");
    expect(termsOnClientChange(d, undefined, es, en)).toBe(EN);
  });
  it("what the client reads: the estimate's own text (\"\" — none); without the key — the company's default in their language", () => {
    const c = co({ termsByLang: { en: EN, es: ES } });
    expect(termsForClient({ terms: "Own (test)" }, c, "es")).toBe("Own (test)");
    expect(termsForClient({ terms: "" }, c, "es")).toBe("");
    expect(termsForClient({}, c, "es")).toBe(ES);
    expect(termsForClient(undefined, c, "ru")).toBe(EN);
  });
  it("a SIGNED estimate without its own Terms keeps the old single text it showed before #1304 — not a newer default in another language", () => {
    const c = co({ terms: "Old single (test)", termsByLang: { en: EN, es: ES } });
    expect(termsForClient({}, c, "es", true)).toBe("Old single (test)");
    expect(termsForClient({ terms: "Own (test)" }, c, "es", true)).toBe("Own (test)");
    expect(termsForClient({}, co({ termsByLang: { es: ES } }), "es", true)).toBe("");
  });
  it("a text as stored: \\r\\n → \\n, control characters (NUL) go, a tab and a line break stay, at most TERMS_MAX code points", () => {
    expect(cleanTerms("a\r\nb\u0000c\td\u0007")).toBe("a\nbc\td");
    expect(Array.from(cleanTerms("😀".repeat(TERMS_MAX + 5))!).length).toBe(TERMS_MAX);
    expect(cleanTerms(5)).toBeUndefined();
    expect(termsByLangFrom({ en: " x ", es: 3, de: "no", ru: "" })).toEqual({ en: "x" });
    expect(termsByLangFrom(["en"])).toEqual({});
  });
});

describe("unit:estimateTerms — the company row (rule 16, step 1)", () => {
  const row = (estimate_settings: unknown) => ({ id: "c1", name: "Co", estimate_settings });
  it("read: the new key; a row before the migration — the old text is the English one", () => {
    expect(companyFromDb(row({ terms_by_lang: { en: EN, es: ES }, terms: EN }), undefined, [], []).estimate.termsByLang).toEqual({ en: EN, es: ES });
    expect(companyFromDb(row({ terms: "Old (test)" }), undefined, [], []).estimate.termsByLang).toEqual({ en: "Old (test)" });
    // the new key is there, its en cleared on purpose: the old one does not come back
    expect(companyFromDb(row({ terms_by_lang: { es: ES }, terms: "Stale (test)" }), undefined, [], []).estimate.termsByLang).toEqual({ es: ES });
  });
  it("write: both keys, the old one = en; other estimate settings stay; an older op (no termsByLang) writes only the old key", () => {
    const c = companyFromDb(row({ terms_by_lang: { en: EN }, other: 1 }), undefined, [], []);
    const out = companyToDb({ ...c, estimate: { ...c.estimate, termsByLang: { en: EN, es: ES } } }, { estimate_settings: { other: 1 } }).estimate_settings as Record<string, unknown>;
    expect(out).toMatchObject({ other: 1, terms_by_lang: { en: EN, es: ES }, terms: EN });
    const cleared = companyToDb({ ...c, estimate: { ...c.estimate, termsByLang: { es: ES } } }, {}).estimate_settings as Record<string, unknown>;
    expect(cleared).toMatchObject({ terms_by_lang: { es: ES }, terms: null });
    const old = companyToDb({ ...c, estimate: { validDays: 7, depositBps: 1000, terms: "From an old op (test)" } }, { estimate_settings: { terms_by_lang: { en: EN, es: ES } } }).estimate_settings as Record<string, unknown>;
    expect(old).toMatchObject({ terms_by_lang: { en: EN, es: ES }, terms: "From an old op (test)" });
  });
});

describe("unit:estimateTerms — the estimate document", () => {
  const doc = (x: Partial<EstimateDoc>): EstimateDoc => ({ options: [], settings: DEFAULT_SETTINGS, ...x });
  it("normalizeDoc: a clean text — the same object; not a string — the key goes (an «old estimate»); \"\" stays \"\"", () => {
    const a = doc({ terms: "Fine (test)" });
    expect(normalizeDoc(a).doc).toBe(a);
    expect(normalizeDoc(doc({ terms: "" })).doc.terms).toBe("");
    expect("terms" in normalizeDoc(doc({ terms: 7 as unknown as string })).doc).toBe(false);
    expect(normalizeDoc(doc({ terms: "a\u0000b" })).doc.terms).toBe("ab");
  });
});

describe("unit:estimateTerms — what the client reads (/p/ from the server, its PDF)", () => {
  const raw = (doc: Record<string, unknown>, lang = "es") =>
    fromRaw({
      status: "sent",
      doc: { options: [{ id: "o1", name: "Only", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 40000 }] }], settings: DEFAULT_SETTINGS, ...doc } as unknown as EstimateDoc,
      company: { name: "Co (test)", terms: EN, terms_by_lang: { en: EN, es: ES } },
      doc_language: lang,
    });
  it("the page: the estimate's own Terms; none — the default in the client's language; \"\" — none; an older server — the old text", () => {
    expect(raw({ terms: "Own (test)" }).terms).toBe("Own (test)");
    expect(raw({}).terms).toBe(ES);
    expect(raw({}, "ru").terms).toBe(EN);
    expect(raw({ terms: "" }).terms).toBe("");
    // signed (an older estimate): the old single text, not the Spanish default
    const signed = fromRaw({ ...{ status: "approved", doc: raw({}).doc!, company: { name: "Co", terms: EN, terms_by_lang: { en: EN, es: ES } }, doc_language: "es" } });
    expect(signed.terms).toBe(EN);
    const older = fromRaw({ status: "sent", doc: raw({}).doc!, company: { name: "Co", terms: "Old server (test)" }, doc_language: "es" });
    expect(older.terms).toBe("Old server (test)");
  });
  it("the PDF: Notes and Terms under headings in the client's language, escaped, before the signatures, not in the small grey class", () => {
    const p = raw({ note: "Gutters <b>cleaned</b> (test)", terms: "Pay in 30 days & <script>alert(1)</script> (test)" });
    const html = estimateHtml(p, { lang: "es" });
    expect(html).toContain("<h2>Notas</h2>");
    expect(html).toContain("<h2>Términos y condiciones</h2>");
    expect(html).toContain("Pay in 30 days &amp; &lt;script&gt;alert(1)&lt;/script&gt; (test)");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Gutters &lt;b&gt;cleaned&lt;/b&gt; (test)");
    expect(html.indexOf("Términos y condiciones")).toBeLessThan(html.indexOf('class="sigs"'));
    expect(html).not.toMatch(/class="note mut"/);
  });
  it("the PDF: no Terms, no Notes — no empty headings", () => {
    const html = estimateHtml(raw({ terms: "" }), { lang: "es" });
    expect(html).not.toContain("Términos y condiciones");
    expect(html).not.toContain("<h2>Notas</h2>");
  });
});

describe("unit:estimateTerms — the old field and en stay one (the store's company save; the server's t08 the same)", () => {
  const est = (x: Partial<Company["estimate"]>): Company["estimate"] => ({ validDays: 7, depositBps: 1000, ...x });
  it("the old field edited (the settings screen before #1307 д): en follows, es stays", () => {
    const prev = est({ terms: EN, termsByLang: { en: EN, es: ES } });
    expect(syncCompanyTerms(prev, { ...prev, terms: "Edited (test)" }).termsByLang).toEqual({ en: "Edited (test)", es: ES });
    expect(syncCompanyTerms(prev, { ...prev, terms: "" }).termsByLang).toEqual({ es: ES });
  });
  it("en edited: the old field follows; nothing changed — as it was", () => {
    const prev = est({ terms: EN, termsByLang: { en: EN } });
    expect(syncCompanyTerms(prev, { ...prev, termsByLang: { en: "New (test)" } }).terms).toBe("New (test)");
    expect(syncCompanyTerms(prev, { ...prev, terms: "Stale (test)", termsByLang: { en: "New (test)" } }).terms).toBe("New (test)");
    expect(syncCompanyTerms(prev, prev)).toBe(prev);
  });
});
