import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { ru } from "../src/i18n/ru";
import { APP_NAME } from "../src/config/product";

// #656 layer 1: the visible name is GoRix (founder 07.11 and 13.11.2026). The old word must not come back where a person
// reads it; the identifiers (`octo.*`, `@octo/*`, bundle id, slug, the old link scheme) are layers 2–3 and stay.
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the visible name — GoRix", () => {
  it("the one constant", () => expect(APP_NAME).toBe("GoRix"));
  it("no OCTODEX in the app's texts (RU / EN / ES)", () => {
    for (const [lang, d] of Object.entries({ en, es, ru })) {
      const old = Object.entries(d).filter(([, v]) => /octodex/i.test(String(v))).map(([k]) => k);
      expect(old, lang).toEqual([]);
    }
  });
  it("the store name, the iOS permission texts and the web page's title", () => {
    const app = JSON.parse(read("app.json")).expo;
    expect(app.name).toBe(APP_NAME);
    expect(JSON.stringify(app.plugins)).not.toMatch(/OCTODEX/);
    for (const l of ["en", "es", "ru"]) expect(read(`locales/${l}.json`), l).not.toMatch(/OCTODEX/);
    expect(read("public/index.html")).not.toMatch(/OCTODEX/);
    expect(JSON.parse(read("public/manifest.webmanifest")).name).toBe(APP_NAME);
  });
  it("what goes to the client: no old fallback name in the PDF, the portal, the documents", () => {
    for (const f of ["src/features/estimatePdf.ts", "src/features/docPdf.ts", "src/app/p/[token].tsx", "src/features/EstimateCard.tsx", "src/features/invoice/InvoiceCard.tsx", "src/app/receipt/[id].tsx", "src/app/purchase-order/[id].tsx", "src/features/version.tsx", "../../supabase/functions/send-push/handler.ts"]) {
      expect(read(f), f).not.toMatch(/"OCTODEX"|OCTODEX v|Open OCTODEX|Abre OCTODEX|Откройте OCTODEX/);
    }
  });
  it("layer 2 (#656): the app is com.gorix.app with the gorix:// scheme; layer 3 stays (slug, owner, projectId)", () => {
    const app = JSON.parse(read("app.json")).expo;
    expect(app.ios.bundleIdentifier).toBe("com.gorix.app");
    expect(app.android.package).toBe("com.gorix.app");
    expect(app.scheme).toBe("gorix");
    expect(app.slug).toBe("octodex");
  });
});
