import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { navContext } from "../src/nav/hierarchy";

const db = makeSeed();
const label = (c: ReturnType<typeof navContext>) => (c.up ? ("key" in c.up.label ? c.up.label.key : c.up.label.text) : null);

describe("navigation hierarchy: back = one level up", () => {
  it("tab roots of the role have no back; a tab the role opens from More goes back to More", () => {
    for (const p of ["/today", "/inbox", "/clients", "/more"]) expect(navContext(p, {}, db, "director").up).toBeUndefined();
    for (const p of ["/plan", "/visits", "/triage"]) expect(navContext(p, {}, db, "director")).toMatchObject({ section: "tab.more", up: { href: "/more" } });
    expect(navContext("/plan", {}, db, "dispatcher").up).toBeUndefined();
    expect(navContext("/visits", {}, db, "tech").up).toBeUndefined();
    expect(navContext("/inbox", {}, db, "tech").up?.href).toBe("/more");
  });
  it("Sales: Leads → Lead → Estimate → Invoice → Receipt", () => {
    const lead = db.leads[0]!;
    expect(navContext(`/lead/${lead.id}`, {}, db, "director")).toMatchObject({ section: "tab.sales", kind: "lead.card", up: { href: "/inbox?tab=leads" } });
    const est = db.estimates.find((e) => e.leadId && db.leads.some((l) => l.id === e.leadId));
    if (est) expect(navContext(`/estimate/${est.id}`, {}, db, "director").up?.href).toBe(`/lead/${est.leadId}`);
    const estNoLead = db.estimates.find((e) => !e.leadId)!;
    const c = navContext(`/estimate/${estNoLead.id}`, {}, db, "director");
    expect(c.up?.href).toBe(`/client/${estNoLead.customerId}`);
    expect(label(c)).toBe(db.customers.find((x) => x.id === estNoLead.customerId)!.name);
    const inv = db.invoices[0]!;
    const job = db.jobs.find((j) => j.id === inv.jobId)!;
    expect(navContext(`/invoice/${inv.id}`, {}, db, "director").up?.href).toBe(job.estimateId ? `/estimate/${job.estimateId}` : `/job/${job.id}`);
    const pay = db.payments.find((p) => p.invoiceId)!;
    expect(navContext(`/receipt/${pay.id}`, {}, db, "director").up?.href).toBe(`/invoice/${pay.invoiceId}`);
  });
  it("Clients: Clients → Client → Job → Visit; schedule and edit go to their owner", () => {
    const job = db.jobs[0]!;
    const cust = db.properties.find((p) => p.id === job.propertyId)!.customerId;
    expect(navContext(`/client/${cust}`, {}, db, "director").up?.href).toBe("/clients");
    expect(navContext(`/job/${job.id}`, {}, db, "director").up?.href).toBe(`/client/${cust}`);
    expect(navContext("/job/schedule", { jobId: job.id }, db, "director").up?.href).toBe(`/job/${job.id}`);
    expect(navContext("/client/edit", { id: cust }, db, "director").up?.href).toBe(`/client/${cust}`);
    expect(navContext("/client/edit", {}, db, "director")).toMatchObject({ kind: "clients.new", up: { href: "/clients" } });
    const v = db.visits.find((x) => x.jobId === job.id)!;
    expect(navContext(`/visit/${v.id}`, {}, db, "dispatcher").up?.href).toBe(`/job/${job.id}`);
    expect(navContext(`/visit/${v.id}`, {}, db, "tech")).toMatchObject({ section: "tab.visits", up: { href: "/visits" } });
  });
  it("new estimate goes back to the lead or client it was started from", () => {
    const lead = db.leads[0]!;
    expect(navContext("/estimate/new", { leadId: lead.id }, db, "director").up?.href).toBe(`/lead/${lead.id}`);
    expect(navContext("/estimate/new", { customerId: db.customers[0]!.id }, db, "director").up?.href).toBe(`/client/${db.customers[0]!.id}`);
  });
  it("More: Jobs, Money, Team, Catalog → item, Company → section", () => {
    for (const p of ["/jobs", "/money", "/team", "/catalog", "/company"]) expect(navContext(p, {}, db, "director").up?.href).toBe("/more");
    expect(navContext("/catalog/x", {}, db, "director").up?.href).toBe("/catalog");
    expect(navContext("/company/profile", {}, db, "director").up?.href).toBe("/company");
  });
  it("every route with a parent has a section label", () => {
    for (const p of ["/lead/x", "/estimate/x", "/invoice/x", "/receipt/x", "/client/x", "/job/x", "/visit/x", "/catalog/x", "/jobs"]) {
      const c = navContext(p, {}, db, "director");
      expect(c.up, p).toBeDefined();
      expect(c.section, p).toBeDefined();
    }
  });
  it("client page and auth have no app navigation", () => {
    expect(navContext("/p/token", {}, db, "director")).toEqual({});
    expect(navContext("/auth/sign-in", {}, db, "director")).toEqual({});
  });
});
