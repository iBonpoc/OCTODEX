/** "Today" numbers open exactly what they count (founder 05.11): list length = the number on the tile, back → Today. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { FIGURES, figureItems, periodNumbers, type Period } from "../src/features/metrics";
import { attentionHref, buildAttention } from "../src/features/attention";
import { navContext } from "../src/nav/hierarchy";

describe("figure drill-down = the number on the tile", () => {
  const db = makeSeed();
  for (const p of ["today", "week", "month"] as Period[]) {
    it(`${p}: every figure lists exactly what it counts`, () => {
      const n = periodNumbers(db, p);
      const len = (f: (typeof FIGURES)[number]) => {
        const x = figureItems(db, f, p);
        return x.leads.length + x.estimates.length + x.payments.length + x.invoices.length;
      };
      expect(len("leads")).toBe(n.leads);
      expect(len("sent")).toBe(n.sent);
      expect(len("signed")).toBe(n.signed);
      expect(len("received")).toBe(n.payments);
      expect(figureItems(db, "signed", p).estimates.reduce((s, e) => s + e.totalCents, 0)).toBe(n.signedCents);
      expect(figureItems(db, "received", p).payments.reduce((s, x) => s + x.amountCents, 0)).toBe(n.receivedCents);
      expect(figureItems(db, "awaiting", p).invoices.reduce((s, i) => s + i.totalCents - i.paidCents, 0)).toBe(n.awaitingCents);
    });
  }
  it("back from a figure goes to Today", () => {
    expect(navContext("/figures/leads", { period: "week" }, db, "director").up?.href).toBe("/today");
  });
});

describe("attention items open their own record, never a general list", () => {
  it("each kind has its own place", () => {
    for (const it of buildAttention(makeSeed())) {
      const href = attentionHref(it);
      expect(href).toContain(it.refId);
      expect(href).not.toMatch(/^\/(money|triage|inbox)$/);
    }
  });
});
