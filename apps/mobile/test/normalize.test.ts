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
  it("build 45 data (no tags, clients without people / numbers): demo gets tags, numbers, tags and people of test clients", () => {
    const d = makeSeed() as unknown as Record<string, unknown>;
    delete d.tags;
    d.customers = [
      ...(d.customers as Record<string, unknown>[]).map(({ people: _p, tagIds: _t, number: _n, ...c }) => c),
      { id: "mine", name: "Added by hand", phone: "(818) 555-0000", sourceId: "src-other", balanceCents: 0 },
    ];
    const db = normalizeDB(d as unknown as DB, "demo");
    expect(db.tags.map((t) => t.name)).toEqual(["VIP", "Regular", "Favorite", "No calls after 6 pm"]);
    const sarah = db.customers.find((c) => c.id === "c1")!;
    expect(sarah.number).toBe("CLT-0001");
    expect(sarah.tagIds).toEqual(["tag-vip", "tag-regular"]);
    expect(peopleOf(sarah).map((p) => p.name)).toEqual(["Sarah Mitchell", "Tom Mitchell"]);
    expect(db.customers.find((c) => c.id === "mine")!.number).toBe("CLT-0008");
    // the cloud keeps what the server sends: no demo tags, no invented numbers
    const cloud = normalizeDB(d as unknown as DB, "cloud");
    expect(cloud.tags).toEqual([]);
    expect(cloud.customers.find((c) => c.id === "c1")!.number).toBeUndefined();
    expect(peopleOf(cloud.customers.find((c) => c.id === "c1")!)).toHaveLength(1);
  });
  it("В1-5: an old record without voidInvoices gets []", () => {
    const d = makeSeed() as unknown as Record<string, unknown>;
    delete d.voidInvoices;
    expect(normalizeDB(d as unknown as DB, "cloud").voidInvoices).toEqual([]);
  });
  it("В1-5: a voided invoice among the live ones (an old record, a server copy) moves to voidInvoices — no sum sees it", () => {
    const d = makeSeed();
    const i1 = d.invoices[0]!;
    const n = normalizeDB({ ...d, invoices: d.invoices.map((i) => (i.id === i1.id ? { ...i, status: "void" as const, voidReason: "wrong" } : i)) }, "cloud");
    expect(n.invoices.some((i) => i.id === i1.id)).toBe(false);
    expect(n.voidInvoices).toEqual([{ ...i1, status: "void", voidReason: "wrong" }]);
    // already apart and copied again: one card, not two
    expect(normalizeDB({ ...n, invoices: [...n.invoices, n.voidInvoices![0]!] }, "cloud").voidInvoices).toHaveLength(1);
  });
  it("today's data is left as is", () => {
    const d = makeSeed();
    expect(normalizeDB(d, "demo")).toEqual(d);
  });
});

/** What a build before wave П-1 saved: jobs without number / customerId, no jobTypes, cancelledJobs, files. */
function beforeWaveP1(): DB {
  const d = makeSeed() as unknown as Record<string, unknown>;
  delete d.jobTypes;
  delete d.cancelledJobs;
  delete d.files;
  delete d.jobLines;
  delete d.calendarEvents;
  delete d.customFields;
  delete d.customFieldValues;
  d.jobs = (d.jobs as Record<string, unknown>[]).map(({ number: _n, customerId: _c, jobTypeId: _t, ...j }) => j);
  return d as unknown as DB;
}

describe("wave П-1: old saved data without the new fields", () => {
  it("demo: jobs get the seed's JOB number and their client; the standard job types come", () => {
    const d = beforeWaveP1();
    d.jobs = [...d.jobs, { id: "j-local", propertyId: "p2", title: "Made on the phone", status: "unscheduled", amountCents: 100 }];
    const db = normalizeDB(d, "demo");
    expect(db.jobs.find((j) => j.id === "j1")).toMatchObject({ number: "JOB-0001", customerId: "c1" });
    expect(db.jobs.find((j) => j.id === "j8")).toMatchObject({ number: "JOB-0008", customerId: "c1" });
    expect(db.jobs.find((j) => j.id === "j-local")).toMatchObject({ number: "JOB-0009", customerId: "c2" });
    expect(new Set(db.jobs.map((j) => j.number)).size).toBe(db.jobs.length);
    expect(db.jobTypes?.map((t) => t.seedKey)).toEqual(["install", "repair", "service", "warranty", "other"]);
    expect(db.cancelledJobs).toEqual([]);
    expect(db.files).toEqual([]);
  });
  it("cloud: no number is invented (only the server sets it); lists default to empty", () => {
    const db = normalizeDB(beforeWaveP1(), "cloud");
    expect(db.jobs.every((j) => j.number === undefined)).toBe(true);
    expect(db.jobs.find((j) => j.id === "j2")!.customerId).toBe("c2");
    expect(db.jobTypes).toEqual([]);
    expect(db.cancelledJobs).toEqual([]);
    expect(db.files).toEqual([]);
    expect(db.jobLines).toEqual([]);
    expect(db.calendarEvents).toEqual([]);
    expect(db.customFields).toEqual([]);
    expect(db.customFieldValues).toEqual([]);
  });
  it("today's data stays as it is", () => {
    const seed = makeSeed();
    const db = normalizeDB(seed, "demo");
    expect(db.jobs).toEqual(seed.jobs);
    expect(db.jobTypes).toEqual(seed.jobTypes);
  });
});
