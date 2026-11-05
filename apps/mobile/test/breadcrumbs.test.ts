import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { breadcrumbs, collapseCrumbs, navContext } from "../src/nav/hierarchy";

const db = makeSeed();
const hrefs = (p: string, params = {}, role: "director" | "dispatcher" | "tech" = "director") => breadcrumbs(p, params, db, role).map((c) => c.href);

describe("breadcrumbs: Home › … › Parent (founder, 05.11.2026)", () => {
  it("client card: Today › Clients", () => {
    const cust = db.customers[0]!;
    const t = breadcrumbs(`/client/${cust.id}`, {}, db, "director");
    expect(t.map((c) => c.href)).toEqual(["/today", "/clients"]);
    expect(t[0]).toMatchObject({ home: true, label: { key: "tab.today" } });
  });
  it("job: Today › Clients › Client", () => {
    const job = db.jobs[0]!;
    const cust = db.properties.find((p) => p.id === job.propertyId)!.customerId;
    expect(hrefs(`/job/${job.id}`)).toEqual(["/today", "/clients", `/client/${cust}`]);
  });
  it("the last crumb is always the back button's target", () => {
    const paths = [
      ...db.leads.map((l) => `/lead/${l.id}`),
      ...db.estimates.map((e) => `/estimate/${e.id}`),
      ...db.invoices.map((i) => `/invoice/${i.id}`),
      ...db.payments.map((p) => `/receipt/${p.id}`),
      ...db.visits.map((v) => `/visit/${v.id}`),
      "/catalog/x",
      "/company/profile",
      "/figures/x",
      "/money",
    ];
    for (const role of ["director", "dispatcher", "tech"] as const)
      for (const p of paths) {
        const t = breadcrumbs(p, {}, db, role);
        expect(t.at(-1)?.href, `${role} ${p}`).toBe(navContext(p, {}, db, role).up?.href);
      }
  });
  it("starts at the role's home, never twice", () => {
    const v = db.visits[0]!;
    expect(hrefs(`/visit/${v.id}`, {}, "tech")).toEqual(["/visits"]);
    expect(breadcrumbs(`/visit/${v.id}`, {}, db, "tech")[0]!.home).toBe(true);
    expect(hrefs("/figures/x")).toEqual(["/today"]);
    expect(hrefs("/catalog/x", {}, "dispatcher")).toEqual(["/triage", "/more", "/catalog"]);
  });
  it("receipt: the whole Sales chain, query links (Leads tab) followed", () => {
    const pay = db.payments.find((p) => p.invoiceId)!;
    const t = hrefs(`/receipt/${pay.id}`);
    expect(t[0]).toBe("/today");
    expect(t.at(-1)).toBe(`/invoice/${pay.invoiceId}`);
    expect(new Set(t).size).toBe(t.length);
  });
  it("tab roots and pages without a parent have no trail", () => {
    for (const p of ["/today", "/clients", "/inbox", "/more", "/p/x"]) expect(hrefs(p)).toEqual([]);
    expect(hrefs("/plan")).toEqual(["/today", "/more"]);
  });
  it("phone folds a long trail into Home › … › Parent", () => {
    expect(collapseCrumbs([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: [], at: -1 });
    expect(collapseCrumbs([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 5], hidden: [2, 3, 4], at: 1 });
  });
});
