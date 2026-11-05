/** Direction of the business (docs/specs/11-trade.md, S16): inheritance, labels, old local data. Same rule as db:T27. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { normalizeDB } from "../src/data/normalize";
import type { DB, ServiceCategory } from "../src/data/types";
import { setupProgress, stepDone } from "../src/features/companySetup";
import { activeCategories, categoryLabel, choosable, fromLegacyTrades, inheritCategory, nameTaken, onlyCategory } from "../src/features/serviceCategories";
import { tFor } from "../src/i18n/translate";

const GUT: ServiceCategory = { id: "g", seedKey: "gutters", position: 0 };
const WASH: ServiceCategory = { id: "w", name: "Pressure washing", position: 1 };

function db(cats: ServiceCategory[], extra: Partial<DB> = {}) {
  return { serviceCategories: cats, leads: [], estimates: [], jobs: [], properties: [], ...extra } as unknown as DB;
}

describe("direction: inheritance company → lead → estimate → job", () => {
  it("a lead gets the company's only active direction, else none", () => {
    expect(inheritCategory(db([GUT]), { kind: "lead" })).toBe("g");
    expect(inheritCategory(db([GUT, WASH]), { kind: "lead" })).toBeUndefined();
    expect(inheritCategory(db([GUT, { ...WASH, archivedAt: "2026-11-01" }]), { kind: "lead" })).toBe("g");
    expect(inheritCategory(db([]), { kind: "lead" })).toBeUndefined();
  });

  it("an explicit value is never overwritten (repeat-safe)", () => {
    expect(inheritCategory(db([GUT]), { kind: "lead" }, "w")).toBe("w");
    expect(inheritCategory(db([GUT]), { kind: "job", estimateId: "e1" }, "w")).toBe("w");
  });

  it("estimate of a lead takes the lead's, even an archived one (same deal); a lead without one gives none", () => {
    const d = db([GUT, { ...WASH, archivedAt: "2026-11-01" }], { leads: [{ id: "l1", serviceCategoryId: "w" }, { id: "l2" }] as DB["leads"] });
    expect(inheritCategory(d, { kind: "estimate", leadId: "l1" })).toBe("w");
    expect(inheritCategory(d, { kind: "estimate", leadId: "l2" })).toBeUndefined();
  });

  it("estimate without a lead: the client's latest active direction, else the only one", () => {
    const d = db([GUT, WASH], {
      properties: [{ id: "p1", customerId: "c1" }] as DB["properties"],
      estimates: [{ id: "e0", customerId: "c1", serviceCategoryId: "g" }] as DB["estimates"],
      jobs: [{ id: "j0", propertyId: "p1", serviceCategoryId: "w" }] as DB["jobs"],
    });
    expect(inheritCategory(d, { kind: "estimate", customerId: "c1" })).toBe("w");
    expect(inheritCategory(d, { kind: "estimate", customerId: "c2" })).toBeUndefined();
    expect(inheritCategory(db([GUT]), { kind: "estimate", customerId: "c2" })).toBe("g");
    const archivedLatest = { ...d, serviceCategories: [GUT, { ...WASH, archivedAt: "2026-11-01" }] };
    expect(inheritCategory(archivedLatest, { kind: "estimate", customerId: "c1" })).toBe("g");
  });

  it("job of an estimate takes the estimate's; an estimate without one gives a job without one", () => {
    const d = db([GUT], { estimates: [{ id: "e1", serviceCategoryId: "w" }, { id: "e2" }] as DB["estimates"] });
    expect(inheritCategory(d, { kind: "job", estimateId: "e1" })).toBe("w");
    expect(inheritCategory(d, { kind: "job", estimateId: "e2" })).toBeUndefined();
    expect(inheritCategory(d, { kind: "job" })).toBe("g");
  });

  it("a change does not go back or forward: inheritance reads only the direct parent at creation", () => {
    const leads = [{ id: "l1", serviceCategoryId: "g" }] as DB["leads"];
    const estimates = [{ id: "e1", leadId: "l1", serviceCategoryId: "w" }] as DB["estimates"];
    const d = db([GUT, WASH], { leads, estimates });
    expect(inheritCategory(d, { kind: "job", estimateId: "e1" })).toBe("w");
    expect(inheritCategory(d, { kind: "estimate", leadId: "l1" })).toBe("g");
  });
});

describe("direction: list and labels", () => {
  const t = tFor("ru") as unknown as (k: never) => string;
  it("preset is translated, own name as typed, archived ones out of the active list", () => {
    expect(categoryLabel(GUT, t)).toBe("Водостоки");
    expect(categoryLabel(GUT, tFor("es") as unknown as (k: never) => string)).not.toBe("Водостоки");
    expect(categoryLabel({ ...GUT, name: "Seamless gutters" }, t)).toBe("Seamless gutters");
    expect(categoryLabel(WASH, t)).toBe("Pressure washing");
    const list = [WASH, GUT, { id: "x", name: "Old", position: 2, archivedAt: "2026-11-01" }];
    expect(activeCategories(list).map((c) => c.id)).toEqual(["g", "w"]);
    expect(onlyCategory(list)).toBeUndefined();
    expect(choosable(list, "x").map((c) => c.id)).toEqual(["g", "w", "x"]);
    expect(choosable(list).map((c) => c.id)).toEqual(["g", "w"]);
  });

  it("a name is taken among active ones, case and spaces ignored", () => {
    expect(nameTaken([WASH], "  pressure WASHING ")).toBe(true);
    expect(nameTaken([{ ...WASH, archivedAt: "2026-11-01" }], "Pressure washing")).toBe(false);
    expect(nameTaken([WASH], "Pressure washing", "w")).toBe(false);
    expect(nameTaken([GUT], "Водостоки", undefined, t)).toBe(true);
  });

  it("the settings step is done with at least one active direction", () => {
    const c = makeSeed().company!;
    expect(stepDone(c, "trades", [])).toBe(false);
    expect(stepDone(c, "trades", [{ ...GUT, archivedAt: "2026-11-01" }])).toBe(false);
    expect(stepDone(c, "trades", [GUT])).toBe(true);
    expect(setupProgress(c, [GUT]).done).toBe(setupProgress(c, []).done + 1);
  });
});

describe("direction: old local data", () => {
  it("company.trades as text → directions: trim, no blanks, no duplicates, order kept (same as the migration)", () => {
    let n = 0;
    const out = fromLegacyTrades(["gutters", "Roofing", " Pressure washing ", "", "gutters", "pressure washing"], () => `id${n++}`);
    expect(out.map((c) => [c.seedKey ?? "-", c.name ?? "-", c.position])).toEqual([
      ["gutters", "-", 0],
      ["roofing", "-", 1],
      ["-", "Pressure washing", 2],
    ]);
    expect(fromLegacyTrades(undefined, () => "x")).toEqual([]);
  });

  it("an older demo phone keeps its directions; an old cloud cache waits for the server", () => {
    const old = structuredClone(makeSeed()) as unknown as Record<string, unknown>;
    delete old.serviceCategories;
    (old.company as Record<string, unknown>).trades = ["plumbing", "Pool care"];
    const demo = normalizeDB(old as unknown as DB, "demo");
    expect(demo.serviceCategories.map((c) => c.seedKey ?? c.name)).toEqual(["plumbing", "Pool care"]);
    expect(normalizeDB(old as unknown as DB, "cloud").serviceCategories).toEqual([]);
    const fresh = structuredClone(makeSeed()) as unknown as Record<string, unknown>;
    delete fresh.serviceCategories;
    expect(normalizeDB(fresh as unknown as DB, "demo").serviceCategories.length).toBe(4);
  });
});
