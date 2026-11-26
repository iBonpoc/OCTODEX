/**
 * #2854: the texts of the money errors (a refund, an advance applied to an invoice) — every word the server can say has its
 * text in RU, EN and ES, none is empty, none is the key itself, EN and ES are not Russian, and the broken English of before
 * («no apply», «no money left», «Only the owner or an admin refunds») does not come back.
 * The lists are tied to the types: a new error word without its text here does not compile.
 */
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { ru, type DictKey } from "../src/i18n/ru";
import type { AdvanceError } from "../src/features/payments/advance";
import type { RefundError } from "../src/features/payments/refund";

const REFUND: Record<RefundError, true> = {
  refund_above_available: true, refund_disputed: true, refund_in_progress: true, refund_not_refundable: true, refund_not_stripe: true,
  refund_through_stripe: true, stripe_refused: true, retry_later: true, not_allowed: true, company_closed: true, not_configured: true,
  live_refused: true, offline: true, failed: true,
};
const ADVANCE: Record<AdvanceError, true> = {
  advance_other_client: true, advance_invoice_not_open: true, advance_not_applicable: true, advance_disputed: true,
  advance_refund_in_progress: true, advance_refund_settling: true, advance_above_balance: true, advance_already_applied: true,
  not_allowed: true, company_closed: true, retry_later: true, offline: true, failed: true,
};
const keys = [
  ...Object.keys(REFUND).map((w) => `mny.refund.err.${w}`),
  ...Object.keys(ADVANCE).map((w) => `mny.adv.err.${w}`),
] as DictKey[];
const DICTS = { ru, en, es } as Record<string, Record<string, string>>;

describe("money error texts (#2854)", () => {
  for (const [lang, d] of Object.entries(DICTS)) {
    it(`${lang}: every error word has a text, not empty and not the key`, () => {
      for (const k of keys) {
        expect(typeof d[k], `${lang} ${k}`).toBe("string");
        expect(d[k].trim().length, `${lang} ${k}`).toBeGreaterThan(5);
        expect(d[k], `${lang} ${k}`).not.toContain("mny.");
      }
    });
  }
  it("en and es are not Russian", () => {
    for (const k of keys) {
      expect(/[А-Яа-яЁё]/.test(en[k]), `en ${k}: ${en[k]}`).toBe(false);
      expect(/[А-Яа-яЁё]/.test(es[k]), `es ${k}: ${es[k]}`).toBe(false);
    }
  });
  it("no text of the family is the same in two languages (an untranslated copy)", () => {
    for (const k of keys) {
      expect(en[k], k).not.toBe(ru[k]);
      expect(es[k], k).not.toBe(en[k]);
    }
  });
  it("the broken English of before does not come back", () => {
    const broken = [/\bno apply\b/i, /no money left/i, /admin refunds\b/i, /admin applies it\b/i, /isn't made yet/i, /isn't applied yet/i];
    for (const k of keys) for (const re of broken) expect(re.test(en[k]), `en ${k}: ${en[k]}`).toBe(false);
  });
  it("who may do it: says «can» and what to do (ask the owner or an admin)", () => {
    expect(en["mny.refund.err.not_allowed"]).toBe("Only the owner or an admin can refund. Ask them.");
    expect(en["mny.adv.err.not_allowed"]).toBe("Only the owner or an admin can apply it. Ask them.");
    expect(en["mny.refund.err.stripe_refused"]).toMatch(/no money was sent/);
    expect(en["mny.adv.err.advance_disputed"]).toMatch(/can't be applied/);
  });
});
