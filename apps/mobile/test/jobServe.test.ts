/**
 * 17-job §11.1 (PR 3b-1): a job / visit of a client «Не обслуживаем» takes no new visit and no estimate;
 * «В пути» of a visit is one line in the job's history.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { jobCustomerId, jobServable, visitServable } from "../src/features/jobs";
import { jobHistory } from "../src/features/jobHistory";
import type { DB } from "../src/data/types";

const noService = (d: DB, customerId: string): DB => ({
  ...d,
  customers: d.customers.map((c) => (c.id === customerId ? { ...c, status: "do_not_service" as const } : c)),
});

describe("jobServable / visitServable", () => {
  it("a job of an active client can be planned; of «Не обслуживаем» — not", () => {
    const d = makeSeed();
    const j = d.jobs.find((x) => x.id === "j1")!;
    expect(jobServable(d, j)).toBe(true);
    expect(jobServable(noService(d, "c1"), j)).toBe(false);
  });
  it("old saved data without customerId: the client through the property", () => {
    const d = noService(makeSeed(), "c1");
    const j = { ...d.jobs.find((x) => x.id === "j1")!, customerId: undefined };
    expect(jobCustomerId(d, j)).toBe("c1");
    expect(jobServable(d, j)).toBe(false);
  });
  it("a visit follows its job; an inspection — the client of its property; no client — can serve", () => {
    const d = noService(makeSeed(), "c1");
    const v1 = d.visits.find((x) => x.id === "v1")!;
    expect(visitServable(d, v1)).toBe(false);
    expect(visitServable(d, d.visits.find((x) => x.id === "v2")!)).toBe(true);
    expect(visitServable(d, { jobId: undefined, propertyId: "p1" })).toBe(false);
    expect(visitServable(d, { jobId: undefined, propertyId: undefined })).toBe(true);
  });
});

describe("jobHistory «В пути»", () => {
  it("one line per visit that left, at the time it left, linked to the visit", () => {
    const d = makeSeed();
    d.visits = d.visits.map((v) => (v.id === "v1" ? { ...v, step: "en_route" as const, enRouteAt: "2026-11-02T15:30:00.000Z" } : v));
    const items = jobHistory(d, "j1", "director").filter((x) => x.title === "job5.h.enRoute");
    expect(items).toEqual([expect.objectContaining({ id: "enroute-v1", at: "2026-11-02T15:30:00.000Z", kind: "action", href: "/visit/v1" })]);
    // the technician sees it on his own job too
    expect(jobHistory(d, "j1", "tech").some((x) => x.id === "enroute-v1")).toBe(true);
  });
  it("a visit that has not left — no line", () => {
    const d = makeSeed();
    d.visits = d.visits.map((v) => ({ ...v, enRouteAt: undefined }));
    expect(jobHistory(d, "j1", "director").some((x) => x.title === "job5.h.enRoute")).toBe(false);
  });
});
