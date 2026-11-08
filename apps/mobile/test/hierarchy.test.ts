import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { navContext } from "../src/nav/hierarchy";

const db = makeSeed();
const label = (c: ReturnType<typeof navContext>) => (c.up ? ("key" in c.up.label ? c.up.label.key : c.up.label.text) : null);

describe("navigation hierarchy: back = one level up", () => {
  it("the 5 tabs and the role's home have no back; another home screen or Leads from ☰ goes back to this role's home", () => {
    for (const p of ["/today", "/plan", "/messages", "/calls", "/clients"]) expect(navContext(p, {}, db, "director").up, p).toBeUndefined();
    for (const p of ["/visits", "/triage"]) expect(navContext(p, {}, db, "director"), p).toMatchObject({ up: { href: "/today" } });
    expect(navContext("/leads", {}, db, "director")).toEqual({ section: "leads" });
    expect(navContext("/triage", {}, db, "director").section).toBe("home");
    expect(navContext("/plan", {}, db, "dispatcher").up).toBeUndefined();
    expect(navContext("/visits", {}, db, "tech").up).toBeUndefined();
    expect(navContext("/leads", {}, db, "sales").up).toBeUndefined();
  });
  it("Leads: Leads → Lead → Estimate → Invoice → Receipt", () => {
    const lead = db.leads[0]!;
    expect(navContext(`/lead/${lead.id}`, {}, db, "director")).toMatchObject({ section: "leads", kind: "lead.card", up: { href: "/leads?tab=leads" } });
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
    // wave 4a-2: a row's list of a property goes up to the property
    const prop = db.properties.find((x) => x.customerId === cust)!;
    expect(navContext(`/property/${prop.id}`, { id: prop.id, s: "visits" }, db, "director").up?.href).toBe(`/property/${prop.id}`);
    expect(navContext(`/property/${prop.id}`, { id: prop.id }, db, "director").up?.href).toBe(`/client/${cust}`);
    // wave 4: a row's list of the client goes up to the client, not to Clients
    expect(navContext(`/client/${cust}`, { id: cust, s: "jobs" }, db, "director").up?.href).toBe(`/client/${cust}`);
    expect(navContext(`/job/${job.id}`, {}, db, "director").up?.href).toBe(`/client/${cust}`);
    expect(navContext("/job/schedule", { jobId: job.id }, db, "director").up?.href).toBe(`/job/${job.id}`);
    expect(navContext("/client/edit", { id: cust }, db, "director").up?.href).toBe(`/client/${cust}`);
    expect(navContext("/client/edit", {}, db, "director")).toMatchObject({ kind: "clients.new", up: { href: "/clients" } });
    // wave 4b-2: the CSV import is under Clients, not a client called «import»
    expect(navContext("/client/import", {}, db, "director")).toMatchObject({ section: "clients", kind: "client.import.title", up: { href: "/clients" } });
    expect(navContext("/client/imports", {}, db, "director")).toMatchObject({ section: "clients", kind: "client.imports.title", up: { href: "/clients" } });
    const v = db.visits.find((x) => x.jobId === job.id)!;
    expect(navContext(`/visit/${v.id}`, {}, db, "dispatcher").up?.href).toBe(`/job/${job.id}`);
    expect(navContext(`/visit/${v.id}`, {}, db, "tech")).toMatchObject({ section: "home", up: { href: "/visits" } });
  });
  it("«Ещё» → Счета → Счёт: the list is a root; an invoice without a job goes up to the list", () => {
    expect(navContext("/invoice", { f: "owed" }, db, "director")).toEqual({ section: "invoices" });
    expect(navContext("/payments", {}, db, "dispatcher")).toEqual({ section: "payments" });
    expect(navContext("/reports", {}, db, "dispatcher")).toEqual({ section: "reports" });
    expect(navContext("/reports/revenue", {}, db, "director")).toMatchObject({ section: "reports", kind: "rpt.title", up: { href: "/reports" } });
    // the last crumb is the report itself, not «Отчёты» again (Деньги №2, 08.11)
    expect(navContext("/reports/owed", {}, db, "director")).toMatchObject({ section: "reports", kind: "rpt.owed.title", up: { href: "/reports", label: { key: "rpt.title" } } });
    expect(navContext("/reports/categories", {}, db, "dispatcher").kind).toBe("rpt.cat.title");
    const loose = { ...db, invoices: [{ ...db.invoices[0]!, id: "iLoose", jobId: "no-such-job" }] };
    expect(navContext("/invoice/iLoose", {}, loose, "director")).toMatchObject({ section: "invoices", up: { href: "/invoice", label: { key: "nav.invoices" } } });
    // the technician has no invoices list: his invoice sits under his Home
    expect(navContext("/invoice/iLoose", {}, loose, "tech").up?.href).toBe("/visits");
  });
  it("a job goes up to its own client (Job.customerId), else to the client of its property", () => {
    const job = db.jobs[0]!;
    const other = db.customers.find((c) => c.id !== db.properties.find((p) => p.id === job.propertyId)!.customerId)!;
    const withCust = { ...db, jobs: db.jobs.map((j) => (j.id === job.id ? { ...j, customerId: other.id } : j)) };
    expect(navContext(`/job/${job.id}`, {}, withCust, "director").up?.href).toBe(`/client/${other.id}`);
    const noCust = { ...db, jobs: db.jobs.map((j) => (j.id === job.id ? { ...j, customerId: undefined } : j)) };
    const viaProp = db.properties.find((p) => p.id === job.propertyId)!.customerId;
    expect(navContext(`/job/${job.id}`, {}, noCust, "director").up?.href).toBe(`/client/${viaProp}`);
  });
  it("«Новая работа» (S17) goes back to the client it was started from, else to Jobs", () => {
    const cust = db.customers[0]!;
    expect(navContext("/job/new", { customerId: cust.id, propertyId: "p1" }, db, "director")).toMatchObject({ section: "clients", kind: "job3.newJob", up: { href: `/client/${cust.id}` } });
    expect(navContext("/job/new", {}, db, "dispatcher")).toMatchObject({ section: "jobs", kind: "job3.newJob", up: { href: "/jobs" } });
    expect(navContext("/job/new", { customerId: "nobody" }, db, "director").up?.href).toBe("/jobs");
  });
  it("new estimate goes back to the lead or client it was started from", () => {
    const lead = db.leads[0]!;
    expect(navContext("/estimate/new", { leadId: lead.id }, db, "director").up?.href).toBe(`/lead/${lead.id}`);
    expect(navContext("/estimate/new", { customerId: db.customers[0]!.id }, db, "director").up?.href).toBe(`/client/${db.customers[0]!.id}`);
    // estimate templates (spec 07 §12): the list under «Сметы»; the builder editing a template — under the list
    expect(navContext("/estimate/templates", {}, db, "director")).toMatchObject({ section: "estimates", kind: "est.tpl.title", up: { href: "/estimates" } });
    expect(navContext("/estimate/new", { editTemplate: "t1" }, db, "director")).toMatchObject({ kind: "est.tpl.editTitle", up: { href: "/estimate/templates" } });
  });
  it("☰ roots (Jobs, Payments, Money, Team, Catalog, Company, Settings, Estimates) have ☰, not «back»; Catalog → item, Company → section", () => {
    for (const p of ["/jobs", "/calls", "/tasks", "/help", "/payments", "/money", "/team", "/catalog", "/company", "/settings", "/estimates"]) {
      const c = navContext(p, {}, db, "director");
      expect(c.up, p).toBeUndefined();
      expect(c.section, p).toBe(p.slice(1));
    }
    // the technician has no Sales lists: his estimates fall back to /estimates
    expect(navContext("/estimate/new", {}, db, "tech").up?.href).toBe("/estimates");
    expect(navContext("/catalog/x", {}, db, "director").up?.href).toBe("/catalog");
    expect(navContext("/company/profile", {}, db, "director").up?.href).toBe("/company");
    // «Приём заявок» (#422): its crumb, «up» — the company's «Лиды»
    const intake = navContext("/company/intake", {}, db, "director");
    expect(intake.kind).toBe("intake.set.title");
    expect(intake.up?.href).toBe("/company/leads");
  });
  it("every route with a parent has a section label", () => {
    for (const p of ["/lead/x", "/estimate/x", "/invoice/x", "/receipt/x", "/client/x", "/job/x", "/visit/x", "/catalog/x", "/company/address"]) {
      const c = navContext(p, {}, db, "director");
      expect(c.up, p).toBeDefined();
      expect(c.section, p).toBeDefined();
    }
  });
  it("client page and auth have no app navigation", () => {
    expect(navContext("/p/token", {}, db, "director")).toEqual({});
    expect(navContext("/auth/sign-in", {}, db, "director")).toEqual({});
  });
  it("LOG п.15: «Моя подпись» is not an estimate with the id «signature» — it sits under «Мои настройки»", () => {
    expect(navContext("/estimate/signature", {}, db, "director")).toMatchObject({ section: "settings", kind: "est.sig.title", up: { href: "/settings/profile" } });
  });
  it("LOG п.16: a conversation goes back to «Сообщения» (after a reload too); the list itself stays a tab root", () => {
    expect(navContext("/messages/c:c1", {}, db, "director")).toMatchObject({ section: "messages", up: { href: "/messages" } });
    expect(navContext("/messages", {}, db, "director").up).toBeUndefined();
  });
  it("LOG п.17: Tasks and Help are «Ещё» roots (above); «Удалить аккаунт» → «Мои настройки»; the legal texts → «Помощь»", () => {
    expect(navContext("/settings/delete-account", {}, db, "tech")).toMatchObject({ section: "settings", kind: "acct.title", up: { href: "/settings/profile" } });
    // spec 26: «Профиль и аккаунт» — its own title in the trail, not «Удалить аккаунт»
    expect(navContext("/settings/profile", {}, db, "director")).toMatchObject({ section: "settings", kind: "fix.settings.profile" });
    expect(navContext("/settings/profile", {}, db, "director").up).toBeUndefined();
    expect(navContext("/legal/terms", {}, db, "tech")).toMatchObject({ section: "help", kind: "legal.terms.title", up: { href: "/help" } });
    expect(navContext("/legal/privacy", {}, db, "director").kind).toBe("legal.privacy.title");
  });
  it("review #274: the legal texts opened before the app is open (sign-in, the consent gate) have no «‹ Помощь» — their own back", () => {
    expect(navContext("/legal/terms", {}, db, "director", { appOpen: false })).toEqual({});
    expect(navContext("/legal/terms", {}, db, "director", { appOpen: true }).up?.href).toBe("/help");
  });
});
