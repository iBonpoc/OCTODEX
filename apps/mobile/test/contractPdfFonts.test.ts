/**
 * unit:contractPdfFonts — #1324 (docs/specs/41): an estimate's PDF is a CA home-improvement contract — no text below
 * print.contract.minPt (10 pt), section headings at least headingPt (10 pt) bold, the right to cancel noticePt (12 pt)
 * bold right before the signatures (B&P §7159; legal-research §1.2). Other documents keep their style's sizes. Test data.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { print, tokens } from "@octo/design-tokens";
import { docPage } from "../src/features/docPdf";

const company = { name: "Co (test)", licenses: [], contacts: [] };
const page = (style: "classic" | "modern" | "compact", contract: boolean) =>
  docPage({ title: "Estimate (test)", meta: [], footer: "", company, body: "<p>x</p>", opts: { lang: "en", style }, contract });
/** the pt sizes the CSS gives a selector */
const sizeOf = (html: string, sel: string) => {
  const m = html.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*font-size: ([\\d.]+)pt`));
  return m ? Number(m[1]) : NaN;
};

describe("unit:contractPdfFonts — #1324", () => {
  it("the contract floor is 10 / 10 / 12 pt (the tokens, mirrored in print.css)", () => {
    expect(print.contract).toEqual({ minPt: 10, headingPt: 10, noticePt: 12 });
  });
  for (const style of ["classic", "modern", "compact"] as const) {
    it(`${style}: an estimate (a contract) — no text below 10 pt, headings ≥ 10 pt bold, the notice 12 pt bold`, () => {
      const html = page(style, true);
      for (const sel of ["body", "h1", "h2", ".mut", "th", ".record td", ".foot"]) expect(sizeOf(html, sel), `${style} ${sel}`).toBeGreaterThanOrEqual(10);
      expect(html).toMatch(/h2 \{ font-weight: 700; \}/);
      expect(sizeOf(html, ".notice")).toBe(12);
      expect(html).toMatch(/\.notice \{[^}]*font-weight: 700/);
    });
    it(`${style}: another document (an invoice) keeps the style's own sizes`, () => {
      const html = page(style, false);
      expect(sizeOf(html, "body")).toBe(print.styles[style].fontPt.body);
      expect(sizeOf(html, ".mut")).toBe(print.styles[style].fontPt.small);
    });
  }
  it("the showcase shows the new tokens (Настройки → Дизайн-система → Печать: rows print.contract.*)", () => {
    // the showcase draws every leaf of tokens.print (features/showcase/Tokens.tsx flatten; section «tokens-print»)
    expect((tokens as unknown as { print: typeof print }).print.contract).toEqual(print.contract);
  });
});
