/**
 * unit:noTestPriceWord — #1873, the founder 16.11: «Везде убираем… Нигде нет её. Надписи этой» (the «test price» mark).
 * - No text of the app (ru / en / es) names a «test price» — the drawing's view included (#1773 merged).
 * - A sample catalog price is reminded about once: the check before the FIRST send (a draft) says «Проверьте цены: в каталоге
 *   стоят примерные»; a sent estimate sent again says nothing (the audit's decision).
 * - The client's document (PDF and /p/: estimateHtml) never carries the word.
 * The data keeps its flag (catalog_items.is_placeholder_price, rule 16): only what is shown changes.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { beforeSend } from "../src/features/sendEstimate";
import { newDoc, sendIssues } from "../src/features/estimateDoc";
import { estimateHtml } from "../src/features/estimatePdf";
import { portalFromEstimate } from "../src/cloud/portal";
import { makeSeed } from "../src/data/seed";
import type { Customer, Estimate, EstimateDoc } from "../src/data/types";
import type { CustomLine } from "@octo/estimating-engine";

const WORD = /тестов\S* цен|цен\S* тестов|test[- ]prices?|precios? de prueba/i;
/** none left: the drawing's view (#1773) was the last (the view's marks went with this PR) */
const LEFT = new Set<string>([]);

const sample = (id: string): CustomLine => ({ id, group: "material", name: `L ${id}`, quantity: "10", unit: "ft", unitPriceCents: 700, source: { module: "gutters", key: "k", testPrice: true, priceCents: 700 } as never });
const docWith = (...lines: CustomLine[]): EstimateDoc => {
  const d = newDoc();
  d.options = [{ ...d.options[0]!, id: "o1", lines }];
  return d;
};

describe("unit:noTestPriceWord — #1873", () => {
  for (const [lang, dict] of [["ru", ru], ["en", en], ["es", es]] as const)
    it(`${lang}: no text names a «test price»`, () => {
      const found = Object.entries(dict as Record<string, string>).filter(([k, v]) => !LEFT.has(k) && WORD.test(v)).map(([k]) => k);
      expect(found).toEqual([]);
    });

  it("the reminder before the first send — once: a draft is reminded, a sent estimate is not", () => {
    const doc = docWith(sample("a"));
    expect(sendIssues(doc, { firstSend: true }).testPrice.map((l) => l.lineId)).toEqual(["a"]);
    expect(sendIssues(doc, { firstSend: false }).testPrice).toEqual([]);
    const db = { customers: [{ id: "c", name: "C", phone: "" } as Customer] };
    const draft = beforeSend(db, { customerId: "c", status: "draft", doc });
    expect(draft.ok === false && draft.reason === "lines" && draft.issues.testPrice.length).toBe(1);
    expect(beforeSend(db, { customerId: "c", status: "sent", doc }).ok).toBe(true);
    // #3058: a draft that went out before (edited after sending) — not reminded again
    expect(beforeSend(db, { customerId: "c", status: "draft", doc, lastSentAt: "2026-11-25T18:00:00.000Z" }).ok).toBe(true);
  });

  it("the reminder's words: «Проверьте цены: в каталоге стоят примерные» (ru), the same key in every language", () => {
    expect(ru["ue.check.samplePrices"]).toBe("Проверьте цены: в каталоге стоят примерные");
    expect(en["ue.check.samplePrices"]).toBeTruthy();
    expect(es["ue.check.samplePrices"]).toBeTruthy();
  });

  it("the client's document never carries the word, in any client language", () => {
    const db = makeSeed();
    const c = db.customers[0]!;
    const prop = db.properties.find((p) => p.customerId === c.id) ?? db.properties[0]!;
    for (const lang of ["en", "es", "ru"] as const) {
      const e: Estimate = { id: `t-${lang}`, customerId: c.id, propertyId: prop.id, title: "T", totalCents: 7000, status: "sent", sentAt: "2026-11-05T17:00:00Z", number: "EST-1", doc: docWith(sample("a")) };
      const html = estimateHtml(portalFromEstimate({ ...db, estimates: [...db.estimates, e] }, e, "Acme"), { lang });
      expect(WORD.test(html), lang).toBe(false);
    }
  });
});
