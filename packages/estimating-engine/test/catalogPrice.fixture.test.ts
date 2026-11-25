/**
 * engine:catalogPrice — one formula in the engine and in the database (spec 53 §5.3б п.1, #1807). The same file
 * test/fixtures/catalogPrice.json is read by T322 (supabase/tests/core_rls.sql, app.item_price_cents): the server counts
 * a material's price with the engine's rule, one rounding, half up.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogPrice } from "../src/index.js";

type Case = { cost: number; taxBps: number; markupBps: number; price: number; note?: string };
const { cases } = JSON.parse(readFileSync(new URL("./fixtures/catalogPrice.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("engine:catalogPrice — the shared examples of #1807", () => {
  it("has the edge examples (half a cent, no tax, the bound)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.some((c) => c.cost === 100000000)).toBe(true);
  });
  for (const c of cases)
    it(`${c.cost} ¢ · tax ${c.taxBps} bps · markup ${c.markupBps} bps → ${c.price} ¢${c.note ? ` (${c.note})` : ""}`, () => {
      expect(catalogPrice(c.cost, c.taxBps, c.markupBps)).toBe(c.price);
    });
});
