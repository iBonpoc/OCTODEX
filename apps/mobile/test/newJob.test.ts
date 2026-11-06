/** S17 «Новая работа» (features/newJob.ts; docs/specs/17-job.md §4, §7.3, §8; server: public.create_job, db T43). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { canCreateJob, canDateNewJob, newJobProblems, servable, withNewJob } from "../src/features/newJob";
import type { DB } from "../src/data/types";

const base = () => makeSeed();
const input = (d: DB) => {
  const p = d.properties.find((x) => x.customerId === "c2")!;
  return { customerId: "c2", propertyId: p.id, title: "  Gutter repair  " };
};

describe("withNewJob", () => {
  it("waits for a date, has its client, a trimmed name, no amount yet", () => {
    const d = base();
    const n = withNewJob(d, "jn", input(d), true);
    const j = n.jobs.find((x) => x.id === "jn")!;
    expect(j).toMatchObject({ status: "unscheduled", customerId: "c2", title: "Gutter repair", amountCents: 0 });
    expect(j.estimateId).toBeUndefined();
    expect(n.jobs.length).toBe(d.jobs.length + 1);
  });
  it("number: the demo numbers at once (after cancelled ones too); the cloud leaves it to the server (offline: none)", () => {
    const d = base();
    d.cancelledJobs = [{ ...d.jobs[0]!, id: "cx", number: "JOB-0042" }];
    expect(withNewJob(d, "jn", input(d), true).jobs.find((x) => x.id === "jn")!.number).toBe("JOB-0043");
    expect(withNewJob(d, "jn", input(d), false).jobs.find((x) => x.id === "jn")!.number).toBeUndefined();
  });
  it("a prospect client becomes active; an active one stays; others are untouched", () => {
    const d = base();
    d.customers = d.customers.map((c) => (c.id === "c2" ? { ...c, status: "prospect" } : c.id === "c3" ? { ...c, status: "prospect" } : c));
    const n = withNewJob(d, "jn", input(d), true);
    expect(n.customers.find((c) => c.id === "c2")!.status).toBe("active");
    expect(n.customers.find((c) => c.id === "c3")!.status).toBe("prospect");
  });
  it("direction (S16): chosen → the client's last → the company's only one → none", () => {
    const d = base();
    const cats = d.serviceCategories.filter((c) => !c.archivedAt);
    expect(withNewJob(d, "jn", { ...input(d), serviceCategoryId: cats[0]?.id ?? "x" }, true).jobs.find((x) => x.id === "jn")!.serviceCategoryId).toBe(cats[0]?.id ?? "x");
    const one = { ...d, serviceCategories: [{ id: "only", position: 0, name: "Only" }], jobs: d.jobs.map((j) => ({ ...j, serviceCategoryId: undefined })), estimates: d.estimates.map((e) => ({ ...e, serviceCategoryId: undefined })) } as DB;
    expect(withNewJob(one, "jn", input(one), true).jobs.find((x) => x.id === "jn")!.serviceCategoryId).toBe("only");
    const none = { ...one, serviceCategories: [] } as DB;
    expect(withNewJob(none, "jn", input(none), true).jobs.find((x) => x.id === "jn")!.serviceCategoryId).toBeUndefined();
  });
});

describe("newJobProblems and rights", () => {
  it("client, address of that client, name", () => {
    const d = base();
    expect(newJobProblems(d, input(d))).toEqual([]);
    expect(newJobProblems(d, { ...input(d), customerId: "nope" })).toContain("noClient");
    const foreign = d.properties.find((p) => p.customerId !== "c2")!.id;
    expect(newJobProblems(d, { ...input(d), propertyId: foreign })).toContain("noAddress");
    expect(newJobProblems(d, { ...input(d), title: "   " })).toContain("noTitle");
    expect(newJobProblems(d, { ...input(d), title: "x".repeat(201) })).toContain("titleLong");
  });
  it("a «do not service» client takes no job (as create_job); an archived one may come back with a job", () => {
    const d = base();
    d.customers = d.customers.map((c) => (c.id === "c2" ? { ...c, status: "do_not_service" } : c));
    expect(newJobProblems(d, input(d))).toContain("notServed");
    expect(servable({ status: "archived" })).toBe(true);
    expect(servable({ status: "active" })).toBe(true);
    expect(servable({ status: undefined })).toBe(true);
  });
  it("office and sales create; only the office (director, dispatcher) gives a date; the tech does neither", () => {
    expect(["director", "dispatcher", "sales"].every((r) => canCreateJob(r as never))).toBe(true);
    expect(canCreateJob("tech")).toBe(false);
    expect(canDateNewJob("director") && canDateNewJob("dispatcher")).toBe(true);
    expect(canDateNewJob("sales") || canDateNewJob("tech")).toBe(false);
  });
});
