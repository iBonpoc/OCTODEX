/**
 * unit:contractPdfFonts — #1324 (docs/specs/41): an estimate's PDF is a CA home-improvement contract — no text below
 * print.contract.minPt (10 pt), section headings at least headingPt (10 pt) bold, the right to cancel noticePt (12 pt)
 * bold right before the signatures, one block with them (B&P §7159; legal-research §1.2). The invoice, the receipt and
 * the purchase order keep their style's sizes. Test data.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { print, tokens, type PrintStyleName } from "@octo/design-tokens";
import { invoiceHtml, receiptHtml } from "../src/features/docPdf";
import { estimateHtml } from "../src/features/estimatePdf";
import { poHtml } from "../src/features/poPdf";
import { companyForPortal, fromRaw } from "../src/cloud/portal";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import { makeSeed } from "../src/data/seed";
import type { EstimateDoc, PurchaseOrder } from "../src/data/types";
import { DOC_LANGS, tFor } from "../src/i18n/translate";

const STYLES: PrintStyleName[] = ["classic", "modern", "compact"];
/** every CSS rule of the page that sets a size in pt: [selector, pt] */
const ptRules = (html: string): [string, number][] =>
  [...(html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .flatMap(([, sel, body]) => [...body!.matchAll(/font-size:\s*([\d.]+)pt/g)].map((m) => [sel!.trim(), Number(m[1])] as [string, number]));

const doc = { options: [{ id: "o1", name: "Only", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 40000 }] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
const estimate = (lang: string, signed: boolean) =>
  fromRaw({
    status: signed ? "approved" : "sent",
    doc,
    company: { name: "Co (test)" },
    doc_language: lang,
    approval: signed ? { option_id: "o1", signer_name: "Ana (test)", signed_at: "2026-11-13T12:00:00Z", selection: { addon_ids: [] } } : null,
  });

describe("unit:contractPdfFonts — the tokens (#1324)", () => {
  it("the contract floor is 10 / 10 / 12 pt, and the showcase lists it (tokens.print → «Печать»)", () => {
    expect(print.contract).toEqual({ minPt: 10, headingPt: 10, noticePt: 12 });
    expect((tokens as unknown as { print: typeof print }).print.contract).toEqual(print.contract);
  });
});

describe("unit:contractPdfFonts — the estimate's PDF is a contract (#1324)", () => {
  for (const style of STYLES)
    for (const lang of DOC_LANGS)
      for (const signed of [false, true])
        it(`${style} · ${lang} · ${signed ? "signed" : "unsigned"}: every pt size ≥ 10 (but the title h1, larger); the notice 12 pt bold, right before the signatures`, () => {
          const html = estimateHtml(estimate(lang, signed), { lang: lang as "en", style });
          const small = ptRules(html).filter(([sel, pt]) => sel !== "h1" && pt < print.contract.minPt);
          expect(small, `${style} ${lang}`).toEqual([]);
          expect(ptRules(html).find(([sel]) => sel === "h2")?.[1]).toBeGreaterThanOrEqual(print.contract.headingPt);
          expect(html).toMatch(/h2 \{ font-weight: 700; \}/);
          expect(ptRules(html).find(([sel]) => sel === ".notice")?.[1]).toBe(print.contract.noticePt);
          expect(html).toMatch(/\.notice \{[^}]*font-weight: 700/);
          // the notice and the signatures — one block that is never split across pages
          expect(html).toMatch(/\.signoff \{ break-inside: avoid; page-break-inside: avoid; \}/);
          const rescission = tFor(lang as "en")("est.rescission");
          expect(html).toContain(`<div class="signoff"><p class="notice">${rescission.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}</p>\n<div class="sigs">`);
          expect(html).not.toMatch(/<p class="mut">[^<]*(Right to cancel|Derecho a cancelar|Право отказа)/);
          // signed: «approved» stands before the notice
          if (signed) expect(html.indexOf('<p class="ok">')).toBeLessThan(html.indexOf('<div class="signoff">'));
        });
});

describe("unit:contractPdfFonts — other documents keep their style (#1324)", () => {
  const d = makeSeed();
  const company = companyForPortal(d, "Co (test)");
  const po: PurchaseOrder = {
    id: "o1", number: "PO-0042", supplierId: "sup-hd", jobId: "j1", status: "sent", revision: 1, fulfillment: "pickup", printPrices: false,
    createdAt: "2026-11-08T12:00:00Z", sentAt: "2026-11-08T12:00:00Z", supplierName: "Home Depot",
    lines: [{ id: "l1", position: 0, name: "Hanger (test)", qty: "2", unit: "box", receivedQty: "0", checkPack: false }],
  };
  for (const style of STYLES)
    it(`${style}: the invoice, the receipt and the purchase order — the style's own sizes, no contract notice`, () => {
      const docs = [
        invoiceHtml(d, d.invoices[0]!, company, { lang: "en", style }),
        ...(d.payments[0] ? [receiptHtml(d, d.payments[0], company, { lang: "en", style })] : []),
        poHtml(d, po, company, { lang: "en", style }),
      ];
      for (const html of docs) {
        expect(ptRules(html).find(([sel]) => sel === "body")?.[1]).toBe(print.styles[style].fontPt.body);
        expect(ptRules(html).find(([sel]) => sel === ".mut")?.[1]).toBe(print.styles[style].fontPt.small);
        expect(html).not.toContain(".notice {");
        expect(html).not.toContain("h2 { font-weight: 700; }");
      }
    });
});
