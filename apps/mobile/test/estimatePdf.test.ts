/**
 * Client documents in the CLIENT's language (CLAUDE.md rule 7; docs/specs/07-estimates.md §2.1, wave E1).
 * The app language is not an input of a document function at all — passing the app's translator is a type error —
 * so for every app language × client language the document depends only on the client language.
 * Also: one header for estimate / invoice / receipt, no costs, own text goes as typed, two signatures, file name.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { estimateFileName, estimateHtml } from "../src/features/estimatePdf";
import { docDay, invoiceHtml, invoiceMessage, receiptHtml, receiptMessage } from "../src/features/docPdf";
import { estimateMessage } from "../src/features/sendEstimate";
import { portalFromEstimate } from "../src/cloud/portal";
import { translate, DOC_LANGS, type DocLang, type Lang } from "../src/i18n/translate";
import { makeSeed } from "../src/data/seed";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import type { DB, Estimate, EstimateDoc } from "../src/data/types";

const APP_LANGS: Lang[] = ["ru", "en", "es"];
const doc: EstimateDoc = {
  options: [
    {
      id: "o1",
      name: "Good",
      recommended: true,
      lines: [
        { id: "l1", group: "labor", name: "Ремонт крыльца по-русски", quantity: "2", unit: "hr", unitPriceCents: 12000, costCents: 4000 },
        { id: "l2", group: "material", name: "Board", quantity: "3", unit: "ea", unitPriceCents: 1550, costCents: 900 },
      ],
    },
  ],
  settings: { ...DEFAULT_SETTINGS, tax: { ...DEFAULT_SETTINGS.tax, rateBps: 0 }, deposit: { kind: "none" } },
  note: "Nota escrita a mano",
} as unknown as EstimateDoc;

function dbWith(lang?: DocLang): { db: DB; e: Estimate } {
  const db = makeSeed();
  const c = db.customers[0]!;
  db.customers = db.customers.map((x) =>
    x.id === c.id ? { ...x, name: "Rosa Diaz", people: [{ id: "m", name: "Rosa Diaz", role: "main", phones: [], emails: [], language: lang }] } : x,
  );
  db.company = db.company ? { ...db.company, docLanguage: "en" } : db.company;
  const e: Estimate = { id: "eX", customerId: c.id, propertyId: db.properties.find((p) => p.customerId === c.id)?.id ?? db.properties[0]!.id, title: "Porch", totalCents: 28650, status: "sent", sentAt: "2026-11-05T17:00:00Z", number: "EST-0042", doc };
  db.estimates = [...db.estimates, e];
  return { db, e };
}
/** words that only one language has (from the dictionaries themselves) */
const word = (lang: DocLang, key: Parameters<typeof translate>[1]) => translate(lang, key);

describe("estimate PDF: in the client's language for every app language", () => {
  for (const app of APP_LANGS)
    for (const client of DOC_LANGS)
      it(`app ${app} × client ${client}`, () => {
        const { db, e } = dbWith(client);
        const p = portalFromEstimate(db, e, "Acme");
        expect(p.lang).toBe(client);
        const html = estimateHtml(p, { lang: p.lang });
        expect(html).toContain(`lang="${client}"`);
        expect(html).toContain(word(client, "est.pdf.customer"));
        expect(html).toContain(word(client, "ue.subtotal"));
        for (const other of DOC_LANGS.filter((l) => l !== client && word(l, "ue.subtotal") !== word(client, "ue.subtotal")))
          expect(html, `no ${other} words`).not.toContain(`>${word(other, "ue.subtotal")}<`);
      });

  it("the app's translator cannot be passed: the type only takes the client's language", () => {
    const { db, e } = dbWith("en");
    const p = portalFromEstimate(db, e, "Acme");
    // type-level checks only (never called): tsc fails the build if these become allowed
    const never = () => {
      // @ts-expect-error — a document never takes the app's `t` (rule 7)
      estimateHtml(p, { t: (k: string) => k, lang: "en" });
      // @ts-expect-error — and never runs without the client's language
      estimateHtml(p, {});
    };
    expect(typeof never).toBe("function");
  });

  it("text the contractor typed goes as typed, in any client language", () => {
    for (const client of DOC_LANGS) {
      const { db, e } = dbWith(client);
      const html = estimateHtml(portalFromEstimate(db, e, "Acme"), { lang: client });
      expect(html).toContain("Ремонт крыльца по-русски");
      expect(html).toContain("Nota escrita a mano");
    }
  });

  it("no costs ever reach the client document", () => {
    const { db, e } = dbWith("en");
    const html = estimateHtml(portalFromEstimate(db, e, "Acme"), { lang: "en" });
    expect(html).not.toContain("$40.00"); // costCents 4000
    expect(html).not.toContain("$9.00"); // costCents 900
    expect(html).not.toMatch(/cost/i);
  });

  it("US money and US numeric dates in every language", () => {
    for (const client of DOC_LANGS) {
      const { db, e } = dbWith(client);
      const html = estimateHtml(portalFromEstimate(db, e, "Acme"), { lang: client });
      expect(html).toContain("$240"); // 2 × $120
      expect(html).toContain(docDay("2026-11-05T17:00:00Z"));
    }
    expect(docDay("2026-11-05T17:00:00Z")).toBe("11/05/2026");
  });

  it("two signatures: the client's and the company's (empty until an employee signs, wave E2)", () => {
    const { db, e } = dbWith("es");
    const p = portalFromEstimate(db, e, "Acme");
    const html = estimateHtml(p, { lang: "es" });
    expect(html).toContain(word("es", "est.pdf.contractor"));
    expect(html).toContain(translate("es", "est.pdf.forCompany", { company: p.company.name }));
    expect(html.split(word("es", "est.pdf.awaitingSignature")).length - 1).toBe(2);
  });

  it("signed by the client: the signature record names the signer and the time", () => {
    const { db, e } = dbWith("en");
    const signed = { ...e, status: "approved" as const, approval: { optionId: "o1", addonIds: [], signerName: "Rosa Diaz", signature: "M0 0 L10 10", at: "2026-11-05T21:05:00Z", channel: "portal" as const, totalCents: 28650, depositCents: 0 } };
    db.estimates = db.estimates.map((x) => (x.id === e.id ? signed : x));
    const html = estimateHtml(portalFromEstimate(db, signed, "Acme"), { lang: "en" });
    expect(html).toContain(word("en", "est.pdf.record"));
    expect(html).toContain("Rosa Diaz");
    expect(html).toContain("11/05/2026");
    expect(html).toContain("<path d=\"M0 0 L10 10\"");
  });

  it("signed on site: the record says on whose device (security-check 05.11)", () => {
    const { db, e } = dbWith("en");
    const me = db.members.find((m) => m.id === db.me)!;
    const signed = { ...e, status: "awaiting_countersign" as const, approval: { optionId: "o1", addonIds: [], signerName: "Rosa Diaz", signature: "M0 0 L1 1", at: "2026-11-05T21:05:00Z", channel: "on_site" as const, totalCents: 28650, depositCents: 0, deviceUserId: me.id } };
    db.estimates = db.estimates.map((x) => (x.id === e.id ? signed : x));
    const html = estimateHtml(portalFromEstimate(db, signed, "Acme"), { lang: "en" });
    expect(html).toContain(translate("en", "est.pdf.onSiteDevice", { name: me.name }).replace("'", "&#39;"));
  });

  it("E2b-2: signed by both — the company's signature in the employee's own name, title, «for company», HIS, and in the record", () => {
    const { db, e } = dbWith("es");
    const signed: Estimate = {
      ...e, status: "approved",
      approval: { optionId: "o1", addonIds: [], signerName: "Rosa Diaz", signature: "M0 0 L1 1", at: "2026-11-05T21:05:00Z", channel: "portal", totalCents: 28650, depositCents: 0 },
      countersign: { userId: db.me, signerName: "Sam Lee", signerTitle: "Project manager", his: "HIS-77", signature: "M2 2 L9 9", at: "2026-11-06T16:00:00Z", method: "saved" },
    };
    db.estimates = db.estimates.map((x) => (x.id === e.id ? signed : x));
    const html = estimateHtml(portalFromEstimate(db, signed, "Acme"), { lang: "es" });
    expect(html).toContain("Sam Lee, Project manager");
    expect(html).toContain(translate("es", "est.pdf.forCompany", { company: portalFromEstimate(db, signed, "Acme").company.name }));
    expect(html).toContain(translate("es", "est.pdf.his", { n: "HIS-77" }));
    expect(html).toContain("<path d=\"M2 2 L9 9\"");
    expect(html.split(word("es", "est.pdf.awaitingSignature")).length - 1).toBe(0);
    expect(html).toContain(`${word("es", "est.pdf.contractor")}: Sam Lee`);
  });

  it("E2b-2: «Valid until» while unsigned (a calendar day, not shifted), gone once the client signed; the client's phone and email", () => {
    const { db, e } = dbWith("en");
    db.customers = db.customers.map((c) => (c.id === e.customerId ? { ...c, phone: "(916) 555-0101", email: "rosa@example.com" } : c));
    const open = { ...e, validUntil: "2026-11-12" };
    db.estimates = db.estimates.map((x) => (x.id === e.id ? open : x));
    const html = estimateHtml(portalFromEstimate(db, open, "Acme"), { lang: "en" });
    expect(html).toContain(`${word("en", "est.pdf.validUntil")}: 11/12/2026`);
    expect(html).toContain("(916) 555-0101 · rosa@example.com");
    const signed = { ...open, status: "awaiting_countersign" as const, approval: { optionId: "o1", addonIds: [], signerName: "Rosa Diaz", signature: "M0 0", at: "2026-11-05T21:05:00Z", channel: "portal" as const, totalCents: 28650, depositCents: 0 } };
    expect(estimateHtml(portalFromEstimate(db, signed, "Acme"), { lang: "en" })).not.toContain(word("en", "est.pdf.validUntil"));
  });

  it("E2b-2: dates and times on the company's clock (its time zone), whatever the device's", () => {
    expect(docDay("2026-11-06T03:30:00Z", "America/Los_Angeles")).toBe("11/05/2026");
    expect(docDay("2026-11-06T03:30:00Z", "America/New_York")).toBe("11/05/2026");
    expect(docDay("2026-11-06T06:30:00Z", "America/New_York")).toBe("11/06/2026");
    expect(docDay("2026-11-12")).toBe("11/12/2026");
    expect(docDay("2026-11-12", "Pacific/Kiritimati")).toBe("11/12/2026");
    expect(() => docDay("2026-11-06T03:30:00Z", "Not/AZone")).not.toThrow();
    const { db, e } = dbWith("en");
    db.company = { ...db.company!, timezone: "America/Los_Angeles" };
    const signed = { ...e, status: "awaiting_countersign" as const, approval: { optionId: "o1", addonIds: [], signerName: "Rosa Diaz", signature: "M0 0", at: "2026-11-06T03:30:00Z", channel: "portal" as const, totalCents: 28650, depositCents: 0 } };
    db.estimates = db.estimates.map((x) => (x.id === e.id ? signed : x));
    expect(estimateHtml(portalFromEstimate(db, signed, "Acme"), { lang: "en" })).toContain("11/05/2026 7:30 PM");
  });

  it("unit prices can be hidden (company setting)", () => {
    const { db, e } = dbWith("en");
    const p = portalFromEstimate(db, e, "Acme");
    expect(estimateHtml(p, { lang: "en" })).toContain("$120");
    const hidden = estimateHtml(p, { lang: "en", showUnitPrices: false });
    expect(hidden).not.toContain("$120");
    expect(hidden).toContain("$240");
  });

  it("three print styles change the layout, not the content", () => {
    const { db, e } = dbWith("en");
    const p = portalFromEstimate(db, e, "Acme");
    const [a, b, c] = (["classic", "modern", "compact"] as const).map((style) => estimateHtml(p, { lang: "en", style }));
    expect(new Set([a, b, c]).size).toBe(3);
    for (const h of [a, b, c]) expect(h).toContain("Ремонт крыльца по-русски");
  });

  it("a brand colour that is not a plain hex colour never reaches the CSS", () => {
    const { db, e } = dbWith("en");
    const p = portalFromEstimate(db, e, "Acme");
    const html = estimateHtml({ ...p, company: { ...p.company, color: "red;}</style><script>x()</script>" } }, { lang: "en", style: "modern" });
    expect(html).not.toContain("<script>");
  });

  it("file name: number and the client's last name", () => {
    expect(estimateFileName({ number: "EST-0012", customer: { name: "John  Smith" } })).toBe("EST-0012 Smith");
    expect(estimateFileName({ number: undefined, customer: { name: "" } })).toBe("Estimate");
    expect(estimateFileName({ number: "EST/1", customer: { name: "A:B" } })).toBe("EST1 AB");
  });
});

describe("invoice and receipt: the same header, in the client's language", () => {
  for (const client of DOC_LANGS)
    it(`client ${client}`, () => {
      const db = makeSeed();
      const inv = db.invoices[0]!;
      const company = portalFromEstimate(db, { ...dbWith().e, customerId: inv.customerId }, "Acme").company;
      const ih = invoiceHtml(db, inv, company, { lang: client });
      expect(ih).toContain(`lang="${client}"`);
      expect(ih).toContain(word(client, "inv.title"));
      expect(ih).toContain('<div class="head">');
      const pay = db.payments[0];
      if (pay) {
        const rh = receiptHtml(db, pay, company, { lang: client });
        expect(rh).toContain(word(client, "rcpt.title"));
        expect(rh).toContain('<div class="head">');
      }
    });
});

describe("SMS and email text: in the client's language", () => {
  it.each(DOC_LANGS)("client %s", (client) => {
    const m = estimateMessage(client, { company: "Acme", name: "Rosa", totalCents: 28650, number: "EST-0042", link: "https://x/p/t" });
    expect(m.text).toBe(translate(client, "ue.sendText", { company: "Acme", name: "Rosa", total: "$286.50", link: "https://x/p/t" }));
    expect(m.subject).toBe(translate(client, "ue.sendSubject", { number: "EST-0042", company: "Acme" }));
  });
});

describe("invoice and receipt SMS / email: in the client's language for every app language", () => {
  for (const app of APP_LANGS)
    for (const client of DOC_LANGS)
      it(`app ${app} × client ${client}`, () => {
        const db = makeSeed();
        const inv = db.invoices[0]!;
        const company = portalFromEstimate(db, { ...dbWith().e, customerId: inv.customerId }, "Acme").company;
        const im = invoiceMessage(db, inv, company, client);
        expect(im.subject).toBe(`${translate(client, "inv.title")} ${inv.number ?? ""}`.trim());
        expect(im.text).toContain(company.name);
        expect(im.text.startsWith(translate(client, "inv.sendText", { company: company.name, number: inv.number ?? "", amount: "", date: "", how: "" }).slice(0, 6))).toBe(true);
        const pay = db.payments[0];
        if (pay) {
          const rm = receiptMessage(pay, company, client);
          expect(rm.subject).toBe(`${translate(client, "rcpt.title")} ${pay.receiptNumber ?? ""}`.trim());
          expect(rm.text).toBe(translate(client, "rcpt.sendText", { company: company.name, amount: rm.text.match(/\$[\d,.]+/)![0], number: pay.receiptNumber ?? "", date: docDay(pay.at) }));
        }
      });
});
