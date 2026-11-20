/**
 * #2016 — who may open a property card (docs/15-story-map.md §7 п.9).
 * С2 ДАНО the technician, КОГДА he opens a property of a client none of his visits is for, ТОГДА it is closed;
 *    the office opens it.
 * С2а ДАНО the technician on an inspection without a job (a lead's address), КОГДА he opens that property, ТОГДА it opens
 *    (the server counts the visit's property too: app.is_customer_assignee).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { makeSeed } from "../src/data/seed";
import { visibleClients } from "../src/features/clients";
import { canSeeProperty } from "../src/features/properties";
import type { DB, Visit } from "../src/data/types";

function base(): { db: DB; propId: string } {
  const db = makeSeed();
  const c = { id: "c2016", name: "Nobody Visited", balanceCents: 0, status: "prospect", people: [] } as unknown as DB["customers"][number];
  const p = { id: "p2016", customerId: "c2016", address: "1 Lone St" } as unknown as DB["properties"][number];
  db.customers = [...db.customers, c];
  db.properties = [...db.properties, p];
  return { db, propId: "p2016" };
}

describe("#2016 the property card asks the role", () => {
  it("С2 the technician: a property of a client he does not see is closed; the office opens it", () => {
    const { db, propId } = base();
    const p = db.properties.find((x) => x.id === propId)!;
    expect(canSeeProperty(db, "tech", p, visibleClients)).toBe(false);
    expect(canSeeProperty(db, "dispatcher", p, visibleClients)).toBe(true);
    expect(canSeeProperty(db, "director", p, visibleClients)).toBe(true);
  });
  it("С2а the technician on an inspection at that address (no job): it opens", () => {
    const { db, propId } = base();
    const p = db.properties.find((x) => x.id === propId)!;
    const v = { id: "v2016", kind: "inspection", propertyId: propId, techId: db.me, assigneeIds: [db.me], start: new Date().toISOString(), durationMin: 60, step: "scheduled" } as unknown as Visit;
    db.visits = [...db.visits, v];
    expect(canSeeProperty(db, "tech", p, visibleClients)).toBe(true);
  });
});
