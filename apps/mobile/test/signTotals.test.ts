/**
 * unit:signTotals (#1147) — the total the phone shows the client is the total the server signs. The examples
 * (test/fixtures/signTotals.json) are read here and by the database's T195: here, that the document becomes exactly
 * these rows (estimate.save → versionRows) and that summarize gives these totals; there, that app.estimate_option_totals
 * over the same rows gives the same totals. Options, add-ons, a discount (percent and fixed), tax by group, a fractional
 * quantity, a deposit by percent and fixed. A change on either side makes one of them red — never a refused signature
 * that only looks different.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { versionRows } from "../src/cloud/estimateRows";
import { summarize } from "../src/features/estimateDoc";
import { addedTotalCents, signTotalFor } from "../src/cloud/legacyTotals";

type Case = { name: string; doc: never; sel: { optionId: string; addonIds: string[] }; rows: unknown; totalCents: number; depositCents: number };
type Quick = { name: string; lines: { qty: string; totalCents: number; optional?: boolean }[]; rows: { quantity: string; unitPriceCents: number; isOptional: boolean }[]; serverTotalCents: number; shownTotalCents: number };
const fx = JSON.parse(readFileSync(new URL("./fixtures/signTotals.json", import.meta.url), "utf8")) as { cases: Case[]; quick: Quick[] };

describe("unit:signTotals — what the client signs on the phone = what the server signs (#1147)", () => {
  it("three examples, each with an option, an add-on, tax or a discount", () => {
    expect(fx.cases.length).toBeGreaterThanOrEqual(3);
  });
  for (const c of fx.cases) {
    it(`${c.name}: the rows the server counts from`, () => {
      expect(versionRows(c.doc)).toEqual(c.rows);
    });
    it(`${c.name}: the phone's total and deposit`, () => {
      const s = summarize(c.doc, c.sel);
      expect({ totalCents: s.totalCents, depositCents: s.depositCents }).toEqual({ totalCents: c.totalCents, depositCents: c.depositCents });
    });
  }
  describe("the quick estimate this phone made (estimate.add) — what the server will count from its rows (T195 the same)", () => {
    for (const q of fx.quick) {
      it(`${q.name}: the price estimate.add writes`, () => {
        // ops.ts estimate.add: unit_price_cents = Math.round(total / qty)
        expect(q.lines.map((l) => Math.round(l.totalCents / (Number(l.qty) || 1)))).toEqual(q.rows.map((r) => r.unitPriceCents));
      });
      it(`${q.name}: addedTotalCents = the server's total`, () => {
        expect(addedTotalCents(q.lines)).toBe(q.serverTotalCents);
      });
    }
    it("one example where the rounding makes another total (so the signature goes without it — no false refusal)", () => {
      expect(fx.quick.some((q) => q.serverTotalCents !== q.shownTotalCents)).toBe(true);
    });
  });
  describe("signTotalFor — the total the quick estimate's signature carries, or none (the door without it)", () => {
    const same = fx.quick.find((q) => q.serverTotalCents === q.shownTotalCents)!;
    const rounded = fx.quick.find((q) => q.serverTotalCents !== q.shownTotalCents)!;
    it("the server counts what the phone shows: the total goes", () => {
      expect(signTotalFor({ totalCents: same.shownTotalCents, lines: same.lines.map((l) => ({ name: "x", ...l })) }, false)).toEqual({ totalCents: same.serverTotalCents });
    });
    it("estimate.add rounded the prices: no total — never a false «the estimate changed»", () => {
      expect(signTotalFor({ totalCents: rounded.shownTotalCents, lines: rounded.lines.map((l) => ({ name: "x", ...l })) }, false)).toEqual({});
    });
    it("this phone's estimate.add of it still queued: no total (the server's lines are not there yet)", () => {
      expect(signTotalFor({ totalCents: same.shownTotalCents, lines: same.lines.map((l) => ({ name: "x", ...l })) }, true)).toEqual({});
    });
    it("loaded from the server with no lines on the phone: the total it has (legacyForEstimate — the server's own count)", () => {
      expect(signTotalFor({ totalCents: 18500, lines: [] }, false)).toEqual({ totalCents: 18500 });
      expect(signTotalFor(undefined, false)).toEqual({});
    });
  });
});
