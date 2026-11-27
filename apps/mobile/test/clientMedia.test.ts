/** #3076 «Фото и файлы» клиента: the photos by visit (the newest first), a visit's photo kept as a file row counted once, the filter. */
import { describe, expect, it } from "vitest";
import { clientMediaOf, filterMedia, mediaChoices } from "../src/features/client/clientMedia";
import { component, space } from "@octo/design-tokens";
import { gridTile } from "../src/features/photoGrid";
import type { FileItem, Job, Property, Visit } from "../src/data/types";

const job = (id: string, propertyId: string): Job => ({ id, propertyId, title: id, status: "scheduled", amountCents: 0, customerId: "c1" }) as Job;
const visit = (id: string, jobId: string, start: string, photos: string[]): Visit =>
  ({ id, jobId, techId: null, start, durationMin: 60, step: "scheduled", scope: [], checklist: [], amountDueCents: 0, photos: photos.map((p) => ({ id: p, kind: "before" })) }) as Visit;
const prop = (id: string): Property => ({ id, customerId: "c1", address: id, city: "", stories: 1 }) as Property;

const jobs = [job("j1", "p1"), job("j2", "p2"), job("jx", "px")];
const visits = [visit("v1", "j1", "2026-11-20T10:00:00Z", ["a", "b"]), visit("v2", "j2", "2026-11-25T10:00:00Z", ["c"]), visit("v0", "j1", "2026-11-26T10:00:00Z", [])];
const files: FileItem[] = [
  { id: "a", kind: "photo", visitId: "v1", jobId: "j1", at: "2026-11-20T10:00:00Z" },
  { id: "d1", kind: "document", jobId: "j2", at: "2026-11-24T10:00:00Z" },
  { id: "r1", kind: "receipt", customerId: "c1", at: "2026-11-26T10:00:00Z" },
  { id: "other", kind: "document", jobId: "jx", at: "2026-11-26T10:00:00Z" },
];
const db = { jobs, files };
const m = clientMediaOf(db, visits, "c1", new Set(["j1", "j2"]));

describe("clientMediaOf", () => {
  it("groups the photos by visit, the newest first; a visit without photos is no group", () => {
    expect(m.groups.map((g) => g.visit.id)).toEqual(["v2", "v1"]);
    expect(m.groups[1]!.propertyId).toBe("p1");
  });
  it("a visit's photo kept as a file row is counted once; another client's file is not here", () => {
    expect(m.files.map((f) => f.id)).toEqual(["r1", "d1"]);
    expect(m.total).toBe(3 + 2);
  });
});

describe("filterMedia / mediaChoices", () => {
  const jobOf = (f: FileItem) => jobs.find((j) => j.id === f.jobId);
  it("a property keeps its visits and its jobs' files", () => {
    const f = filterMedia(m, { propertyId: "p2", jobId: null }, jobOf);
    expect(f.groups.map((g) => g.visit.id)).toEqual(["v2"]);
    expect(f.files.map((x) => x.id)).toEqual(["d1"]);
    expect(f.total).toBe(2);
  });
  it("a job keeps only its own", () => {
    const f = filterMedia(m, { propertyId: null, jobId: "j1" }, jobOf);
    expect(f.groups.map((g) => g.visit.id)).toEqual(["v1"]);
    expect(f.files).toEqual([]);
  });
  it("offers only the properties and jobs that have something; jobs narrowed by the property", () => {
    const props = [prop("p1"), prop("p2"), prop("p3")];
    expect(mediaChoices(m, props, jobs, null).properties.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(mediaChoices(m, props, jobs, "p1").jobs.map((j) => j.id)).toEqual(["j1"]);
  });
});

describe("gridTile (#3076: 4 in a row on a phone, more where photoThumb fits)", () => {
  it("a phone: 4 tiles fill the width", () => {
    const w = 334;
    const s = gridTile(w);
    expect(s).toBeGreaterThanOrEqual(component.photoThumb);
    expect(4 * s + 3 * space[2]).toBeLessThanOrEqual(w);
  });
  it("a wide card: more columns, a tile never under photoThumb", () => {
    const s = gridTile(900);
    expect(s).toBeGreaterThanOrEqual(component.photoThumb);
    expect(Math.floor((900 + space[2]) / (s + space[2]))).toBeGreaterThan(4);
  });
});
