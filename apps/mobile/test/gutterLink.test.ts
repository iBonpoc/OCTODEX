/**
 * unit:gutterLink — spec 33 П24 (founder 09.11): where «Замер желобов» goes (#697), a lead's measurement on its address
 * without a write (S4h, #704), relink / unlink (#692), delete — not under a signed estimate (#690).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { registerModule, placeActions } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { clientStart, gutterData, K, latestFor, measureHref, putMeasurement, relink, removeMeasurement, withGutterData } from "../src/modules/gutters/data";
import { signedOn } from "../src/modules/gutters/estimateLink";
import { makeSeed } from "../src/data/seed";
import type { MeasurementRow } from "../src/modules/gutters/canvas/model";
import type { DB } from "../src/data/types";

registerModule(gutters);
const DAY = 86_400_000;
const on = { modules: { gutters: { enabled: true, trialEndsAt: new Date(Date.now() + DAY).toISOString(), settings: {}, rowVersion: 1 } } };
const M = (m: Partial<MeasurementRow>): MeasurementRow => ({ id: "m1", label: null, status: "draft", propertyId: null, leadId: null, ...m });
const DRAW = "/module/gutters/draw";

describe("S4h (#704): a lead's measurement shows on its address — no write", () => {
  const g = { measurements: [M({ id: "mL", leadId: "l1", updatedAt: "2026-11-05" }), M({ id: "mP", propertyId: "p2", updatedAt: "2026-11-01" })], elements: [] };
  it("the address finds the measurements of its leads (and its own)", () => {
    expect(latestFor(g, { propertyId: "p1", leadIds: ["l1"] })?.id).toBe("mL");
    expect(latestFor(g, { propertyId: "p1" })).toBeUndefined(); // before: lost on the address
    expect(latestFor(g, { propertyId: "p2", leadIds: ["l9"] })?.id).toBe("mP");
  });
  it("a lead still finds only its own (an address of another lead does not leak in)", () => {
    expect(latestFor(g, { leadId: "l2", leadIds: ["l1"] })).toBeUndefined();
  });
  it("the place on the address opens it", () => {
    const a = placeActions("property", on, { role: "sales", propertyId: "p1", leadIds: ["l1"] }, undefined, { gutters: g });
    expect(a[0]).toMatchObject({ labelKey: "mod.gutters.measureOpen", href: `${DRAW}?m=mL` });
  });
});

describe("«Замер желобов» on a client and a visit (#697, П24 А3, А7)", () => {
  it("measureHref: the newest one, else a new one linked", () => {
    expect(measureHref(DRAW, { measurements: [], elements: [] }, { propertyId: "p1" })).toEqual({ href: `${DRAW}?property=p1` });
  });
  it("client: one address → straight to it; several → pick; none → add one on the card", () => {
    const db = makeSeed();
    const two = db.customers.find((c) => db.properties.filter((p) => p.customerId === c.id).length >= 2);
    const one = db.customers.find((c) => db.properties.filter((p) => p.customerId === c.id).length === 1)!;
    const place = db.properties.find((p) => p.customerId === one.id)!;
    expect(clientStart(DRAW, db, one.id)).toEqual({ kind: "go", href: `${DRAW}?property=${place.id}` });
    if (two) expect(clientStart(DRAW, db, two.id)).toMatchObject({ kind: "pick" });
    expect(clientStart(DRAW, db, "nobody")).toEqual({ kind: "none" });
  });
  it("the places: a client → the start screen; a visit → its lead's measurement, else its address's", () => {
    expect(placeActions("client", on, { role: "tech", customerId: "c1" }, undefined, {})).toEqual([expect.objectContaining({ labelKey: "mod.gutters.measure", href: "/module/gutters/start?customer=c1" })]);
    expect(placeActions("visit", on, { role: "tech", visitId: "v1", leadId: "l1", propertyId: "p1" }, undefined, {})[0]).toMatchObject({ href: `${DRAW}?lead=l1&property=p1` });
    expect(placeActions("visit", on, { role: "tech", visitId: "v1", propertyId: "p1" }, undefined, {})[0]).toMatchObject({ href: `${DRAW}?property=p1` });
    expect(placeActions("visit", on, { role: "tech", visitId: "v1" }, undefined, {})).toEqual([]);
  });
});

const store = (m: MeasurementRow, estimates: DB["estimates"] = []) => {
  const sent: { kind: string; payload: Record<string, unknown> }[] = [];
  const s = {
    db: { ...withGutterData(makeSeed(), putMeasurement(m)), estimates } as DB,
    sent,
    moduleOp: (_k: string, c: { kind: string; payload: Record<string, unknown>; apply: (d: DB) => DB }) => {
      sent.push({ kind: c.kind, payload: c.payload });
      s.db = c.apply(s.db);
      return () => undefined;
    },
  };
  return s;
};

describe("relink / unlink (#692, П24 Б5)", () => {
  it("an address → a lead: the address goes (one link at a time); a full write of the measurement", () => {
    const s = store(M({ propertyId: "p1" }));
    expect(relink(s as never, "m1", { leadId: "l7" })).toBeTypeOf("function");
    expect(s.sent).toEqual([{ kind: K.mSave, payload: { m: { id: "m1", label: null, status: "draft", propertyId: null, leadId: "l7" } } }]);
    expect(gutterData(s.db).measurements[0]).toMatchObject({ leadId: "l7", propertyId: null });
  });
  it("unlink → a draft (both empty — the server gets nulls, not missing keys)", () => {
    const s = store(M({ leadId: "l1" }));
    relink(s as never, "m1", null);
    expect(s.sent[0]!.payload).toEqual({ m: { id: "m1", label: null, status: "draft", propertyId: null, leadId: null } });
  });
  it("the same link again or an unknown measurement — nothing", () => {
    const s = store(M({ leadId: "l1" }));
    expect(relink(s as never, "m1", { leadId: "l1" })).toBeNull();
    expect(relink(s as never, "nope", null)).toBeNull();
    expect(s.sent).toEqual([]);
  });
});

describe("delete (#690, П24 Б6)", () => {
  const line = (measurementId: string) => ({ id: "x", name: "Gutter", group: "material", quantity: "10", unit: "ft", unitPriceCents: 100, source: { module: "gutters", measurementId } });
  const est = (status: DB["estimates"][number]["status"]) => ({ id: "e1", status, doc: { options: [{ id: "o", name: "A", lines: [line("m1")] }] } }) as unknown as DB["estimates"][number];
  it("soft: measurement.remove; off the phone with its elements", () => {
    const s = store(M({}));
    removeMeasurement(s as never, "m1");
    expect(s.sent).toEqual([{ kind: K.mRemove, payload: { id: "m1" } }]);
    expect(gutterData(s.db).measurements).toEqual([]);
  });
  it("a signed estimate (awaiting countersign, approved) holds it; a draft or sent one does not", () => {
    expect(signedOn({ estimates: [est("approved")] }, "m1")).toBe(true);
    expect(signedOn({ estimates: [est("awaiting_countersign")] }, "m1")).toBe(true);
    expect(signedOn({ estimates: [est("draft")] }, "m1")).toBe(false);
    expect(signedOn({ estimates: [est("sent")] }, "m1")).toBe(false);
    expect(signedOn({ estimates: [est("approved")] }, "m2")).toBe(false);
  });
});
