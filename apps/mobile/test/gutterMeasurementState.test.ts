/**
 * unit:gutterMeasurementState — the module's home «Замеры» (spec 33 П25.4, PR-H1): the computed state of a measurement
 * (never the database's draft / ready), the chips with their counts, the search.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/cloud/ops", () => ({ PermanentError: class extends Error {}, uploadPhoto: () => null }));
import { asMeasurementFilter, filterMeasurements, matchMeasurement, measurementList, measurementState } from "../src/modules/gutters/measurements";

const M = (id: string, x: Record<string, unknown> = {}) => ({ id, label: null, status: "draft", propertyId: null, leadId: null, ...x });
const run = (id: string, m: string) => ({ id, measurementId: m, kind: "run" as const, geom: { a: [0, 0], b: [120, 0] }, attrs: {}, confidence: "drawn" as const });
const line = (m: string, at = "2026-11-10T10:00:00Z") => ({ id: `ln-${m}-${at}`, source: { module: "gutters", measurementId: m, at } });
const E = (id: string, status: string, ms: string[], at?: string) => ({ id, status, doc: { options: [{ lines: ms.map((m) => line(m, at)) }] } });
const db = (measurements: unknown[], estimates: unknown[] = [], elements: unknown[] = []) =>
  ({
    moduleData: { gutters: { measurements, elements } },
    leads: [{ id: "l1", name: "Ann Lee", phone: "(626) 555-0101", address: "5 Pine Rd" }],
    properties: [{ id: "p1", customerId: "c1", address: "12 Oak St", city: "Austin" }],
    customers: [{ id: "c1", name: "Bob Ray", phone: "+1 512 555 0199" }],
    estimates,
  }) as never;

describe("measurementState (П25.4)", () => {
  it("no lead and no address — unlinked («Черновик»), whatever the database status says", () => {
    expect(measurementState(db([]), M("a", { status: "ready" }) as never, true)).toEqual({ state: "unlinked", changed: false, engineChanged: false });
  });
  it("linked, no estimate of it — noEstimate; a declined one does not count", () => {
    expect(measurementState(db([]), M("a", { leadId: "l1" }) as never, true).state).toBe("noEstimate");
    expect(measurementState(db([], [E("e1", "declined", ["a"])]), M("a", { leadId: "l1" }) as never, true).state).toBe("noEstimate");
    // another measurement's estimate is not this one's
    expect(measurementState(db([], [E("e1", "sent", ["b"])]), M("a", { propertyId: "p1" }) as never, true).state).toBe("noEstimate");
  });
  it("an estimate, none signed — estimate, with that estimate (its status is the chip)", () => {
    const v = measurementState(db([], [E("e1", "sent", ["a"])]), M("a", { leadId: "l1", status: "ready" }) as never, true);
    expect(v).toMatchObject({ state: "estimate", changed: false });
    expect(v.estimate?.id).toBe("e1");
  });
  it("the drawing edited after its estimate (draft again) — «Чертёж изменён»; nothing drawn — never changed", () => {
    expect(measurementState(db([], [E("e1", "viewed", ["a"])]), M("a", { leadId: "l1", status: "draft" }) as never, true)).toMatchObject({ state: "estimate", changed: true });
    expect(measurementState(db([], [E("e1", "viewed", ["a"])]), M("a", { leadId: "l1", status: "draft" }) as never, false)).toMatchObject({ changed: false });
  });
  it("awaiting the company's signature or approved — signed, even beside a newer open one; changed after — «Изменён после подписи»", () => {
    for (const s of ["awaiting_countersign", "approved"]) {
      const v = measurementState(db([], [E("e1", s, ["a"]), E("e2", "draft", ["a"], "2026-11-11T10:00:00Z")]), M("a", { leadId: "l1", status: "ready" }) as never, true);
      expect(v).toMatchObject({ state: "signed", changed: false });
      expect(v.estimate?.id).toBe("e1");
    }
    expect(measurementState(db([], [E("e1", "approved", ["a"])]), M("a", { propertyId: "p1", status: "draft" }) as never, true)).toMatchObject({ state: "signed", changed: true });
  });
});

describe("«Замеры»: chips, counts, search (П25.3 А)", () => {
  const data = db(
    [
      M("draft", { updatedAt: "2026-11-11T05:00:00Z" }),
      M("lead", { leadId: "l1", updatedAt: "2026-11-11T04:00:00Z" }),
      M("est", { propertyId: "p1", status: "ready", updatedAt: "2026-11-11T03:00:00Z" }),
      M("sig", { propertyId: "p1", status: "ready", updatedAt: "2026-11-11T02:00:00Z" }),
    ],
    [E("e1", "sent", ["est"]), E("e2", "approved", ["sig"])],
    [run("r1", "est"), run("r2", "sig")],
  );
  const items = measurementList(data);
  it("whom for: the address's client first, else «Лид: имя», else nobody; the lead's own address when it has no property", () => {
    expect(items.map((x) => [x.id, x.forKind, x.forName])).toEqual([["draft", "none", null], ["lead", "lead", "Ann Lee"], ["est", "client", "Bob Ray"], ["sig", "client", "Bob Ray"]]);
    expect(items[1]!.address).toBe("5 Pine Rd");
  });
  it("every chip counts its own state; «Все» — all; the chip shows only its cards", () => {
    const { counts, shown } = filterMeasurements(items, "all");
    expect(counts).toEqual({ all: 4, drafts: 1, noEstimate: 1, estimate: 1, signed: 1 });
    expect(shown).toHaveLength(4);
    expect(filterMeasurements(items, "drafts").shown.map((x) => x.id)).toEqual(["draft"]);
    expect(filterMeasurements(items, "noEstimate").shown.map((x) => x.id)).toEqual(["lead"]);
    expect(filterMeasurements(items, "estimate").shown.map((x) => x.id)).toEqual(["est"]);
    expect(filterMeasurements(items, "signed").shown.map((x) => x.id)).toEqual(["sig"]);
  });
  it("the search: a part of a name, the address, the phone by its digits; the counts follow the search", () => {
    expect(filterMeasurements(items, "all", "ann").shown.map((x) => x.id)).toEqual(["lead"]);
    expect(filterMeasurements(items, "all", "oak st").counts).toMatchObject({ all: 2, estimate: 1, signed: 1, drafts: 0 });
    expect(filterMeasurements(items, "all", "555-0199").shown.map((x) => x.id)).toEqual(["est", "sig"]);
    expect(matchMeasurement(items[0]!, "zzz")).toBe(false);
    // two digits are not a phone: «12» finds the address, not every phone with 1 and 2
    expect(filterMeasurements(items, "all", "12").shown.map((x) => x.id)).toEqual(["est", "sig"]);
  });
  it("a kept chip that is not one of ours falls back to «Все»", () => {
    expect(asMeasurementFilter("signed")).toBe("signed");
    expect(asMeasurementFilter("ready")).toBe("all");
    expect(asMeasurementFilter(undefined)).toBe("all");
  });
});
