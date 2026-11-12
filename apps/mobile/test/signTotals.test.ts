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

type Case = { name: string; doc: never; sel: { optionId: string; addonIds: string[] }; rows: unknown; totalCents: number; depositCents: number };
const fx = JSON.parse(readFileSync(new URL("./fixtures/signTotals.json", import.meta.url), "utf8")) as { cases: Case[] };

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
});
