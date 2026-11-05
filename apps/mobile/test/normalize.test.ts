import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { normalizeDB } from "../src/data/normalize";
import { peopleOf } from "../src/data/people";
import { filterLeads, leadTimeline, sourceGroups } from "../src/features/leads";
import type { DB } from "../src/data/types";

/** What build 32 saved on the phone: no sources / tasks / activities; leads and clients keep the source by name. */
function build32(): DB {
  const d = makeSeed() as unknown as Record<string, unknown>;
  delete d.sources;
  delete d.tasks;
  delete d.activities;
  d.leads = (d.leads as Record<string, unknown>[]).map(({ sourceId, ...l }) => ({ ...l, source: String(sourceId).replace("src-", "").replace(/^./, (c) => c.toUpperCase()) }));
  d.customers = (d.customers as Record<string, unknown>[]).map(({ sourceId, ...c }) => ({ ...c, source: String(sourceId).replace("src-", "").replace(/^./, (c) => c.toUpperCase()) }));
  return d as unknown as DB;
}

describe("old saved data after an app update", () => {
  it("demo: lists are filled, sources by name become ids, screens' logic runs", () => {
    const db = normalizeDB(build32(), "demo");
    expect(db.sources.length).toBeGreaterThan(5);
    expect(db.tasks).toEqual([]);
    expect(db.activities).toEqual([]);
    expect(db.leads.every((l) => db.sources.some((s) => s.id === l.sourceId))).toBe(true);
    expect(db.leads.find((l) => l.name === "Kevin Brooks")!.sourceId).toBe("src-thumbtack");
    expect(db.customers.every((c) => !!c.sourceId)).toBe(true);
    // what crashed on the phone: the Leads list and the lead card
    expect(() => filterLeads(db, "director", { filter: "open" })).not.toThrow();
    expect(() => leadTimeline(db, db.leads[0]!)).not.toThrow();
    expect(sourceGroups(db).length).toBeGreaterThan(0);
  });
  it("cloud cache without sources does not crash (the server refresh brings them)", () => {
    const db = normalizeDB(build32(), "cloud");
    expect(db.sources).toEqual([]);
    expect(() => filterLeads(db, "director", { filter: "open" })).not.toThrow();
  });
  it("build 45 data (no tags, clients without people / numbers): demo gets default tags, clients read as one main person", () => {
    const d = makeSeed() as unknown as Record<string, unknown>;
    delete d.tags;
    d.customers = (d.customers as Record<string, unknown>[]).map(({ people: _p, tagIds: _t, number: _n, ...c }) => c);
    const db = normalizeDB(d as unknown as DB, "demo");
    expect(db.tags.map((t) => t.name)).toEqual(["VIP", "Regular", "Favorite", "No calls after 6 pm"]);
    const sarah = db.customers.find((c) => c.id === "c1")!;
    expect(peopleOf(sarah)).toHaveLength(1);
    expect(peopleOf(sarah)[0]!.phones[0]!.number).toBe("(626) 555-0142");
    expect(sarah.tagIds ?? []).toEqual([]);
    expect(normalizeDB(d as unknown as DB, "cloud").tags).toEqual([]);
  });
  it("today's data is left as is", () => {
    const d = makeSeed();
    expect(normalizeDB(d, "demo")).toEqual(d);
  });
});
