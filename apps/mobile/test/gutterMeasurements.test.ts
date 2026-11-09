/** «Замеры» (spec 33 П20.22): every measurement, the drafts without a client too, newest first. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/cloud/ops", () => ({ PermanentError: class extends Error {}, uploadPhoto: () => null }));
import { measurementList } from "../src/modules/gutters/measurements";
import { linkChoices } from "../src/modules/gutters/data";

const run = (id: string, m: string, len: number) => ({ id, measurementId: m, kind: "run" as const, geom: { a: [0, 0], b: [len, 0] }, attrs: {}, confidence: "drawn" as const });
const db = (measurements: unknown[], elements: unknown[]) =>
  ({ moduleData: { gutters: { measurements, elements } }, leads: [{ id: "l1", name: "Ann Lee" }], properties: [{ id: "p1", address: "12 Oak St", city: "Austin" }] }) as never;

describe("measurementList", () => {
  it("a draft for nobody, one for a lead, one for an address — newest first, with what is drawn", () => {
    const xs = measurementList(
      db(
        [
          { id: "a", label: null, status: "draft", propertyId: null, leadId: null, updatedAt: "2026-11-09T01:00:00Z" },
          { id: "b", label: null, status: "ready", propertyId: "p1", leadId: "l1", updatedAt: "2026-11-09T03:00:00Z" },
          { id: "c", label: null, status: "draft", propertyId: "p1", leadId: null, updatedAt: "2026-11-09T02:00:00Z" },
        ],
        [run("r1", "a", 120), run("r2", "a", 240), run("r3", "b", 60)],
      ),
    );
    expect(xs.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(xs[0]).toMatchObject({ forName: "Ann Lee", address: "12 Oak St, Austin", status: "ready", runs: 1 });
    expect(xs[1]).toMatchObject({ forName: "12 Oak St, Austin", runs: 0 });
    expect(xs[2]).toMatchObject({ forName: null, runs: 2, lengthIn: 360 });
  });
  it("no data — no list", () => {
    expect(measurementList({ moduleData: {}, leads: [], properties: [] } as never)).toEqual([]);
  });
});

describe("linkChoices («Привязать замер»)", () => {
  const base = {
    leads: [
      { id: "l1", name: "Ann Lee", status: "new", address: "12 Oak St" },
      { id: "l2", name: "Bob Ray", status: "won" },
      { id: "l3", name: "Cal Moe", status: "declined" },
    ],
    customers: [{ id: "c1", name: "Ann Lee" }, { id: "c2", name: "Zed Zu" }],
    properties: [{ id: "p1", customerId: "c1", address: "1 Elm", city: "A" }, { id: "p2", customerId: "c1", address: "2 Elm", city: "A" }],
  } as never;
  it("open leads only; clients with their addresses; found by a part of a name or a lead's address", () => {
    const all = linkChoices(base, "");
    expect(all.leads.map((l) => l.id)).toEqual(["l1"]);
    expect(all.clients.map((x) => [x.c.id, x.places.length])).toEqual([["c1", 2], ["c2", 0]]);
    expect(linkChoices(base, "oak").leads.map((l) => l.id)).toEqual(["l1"]);
    expect(linkChoices(base, "zed").clients.map((x) => x.c.id)).toEqual(["c2"]);
    expect(linkChoices(base, "nobody")).toEqual({ leads: [], clients: [] });
  });
});
