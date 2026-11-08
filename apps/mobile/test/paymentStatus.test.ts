/**
 * unit:paymentStatus — the app reads payments of a newer server without breaking (docs/specs/35, docs/15 §5 Payment).
 * ACH on its way, failed and refunded payments are not money; an unknown status or method never crashes.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paymentMethodFromDb, paymentShown, paymentStatusShown } from "../src/cloud/statusMap";

const ROOT = path.resolve(__dirname, "../../..");
const core = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261104000000_core.sql"), "utf8");
const body = core.slice(core.indexOf("create table public.payments ("));
const dbStatuses = [...body.match(/check \(status in \(([^)]*)\)\)/)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const map = fs.readFileSync(path.join(ROOT, "docs/15-story-map.md"), "utf8");

describe("unit:paymentStatus", () => {
  it("every status the database allows has a decision, and nothing else", () => {
    expect(Object.keys(paymentStatusShown).sort()).toEqual([...dbStatuses].sort());
  });
  it("only received money is shown: succeeded and partially refunded", () => {
    expect(dbStatuses.filter(paymentShown).sort()).toEqual(["partially_refunded", "succeeded"]);
    expect(paymentShown("pending")).toBe(false);
    expect(paymentShown("failed")).toBe(false);
  });
  it("the story map lists the same shown statuses", () => {
    const row = map.split("\n").find((l) => l.startsWith("| Payment |"))!;
    const ticks = [...row.split("|")[2]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    expect(ticks.sort()).toEqual(["partially_refunded", "succeeded"]);
  });
  it("a status of a newer server is not shown and does not throw", () => {
    expect(paymentShown("disputed_hold")).toBe(false);
    expect(paymentShown("")).toBe(false);
    expect(paymentShown("constructor")).toBe(false);
  });
  it("methods: ach is the bank; tap to pay is a card; an unknown method falls back to a card", () => {
    expect(paymentMethodFromDb("ach")).toBe("ach");
    expect(paymentMethodFromDb("zelle")).toBe("zelle");
    expect(paymentMethodFromDb("tap_to_pay")).toBe("card");
    expect(paymentMethodFromDb("financing")).toBe("card");
    expect(paymentMethodFromDb("")).toBe("card");
  });
});
