import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { roleNav } from "../src/nav/roles";
import fs from "node:fs";
import path from "node:path";
import { breadcrumbs, collapseCrumbs, navContext, sectionTab } from "../src/nav/hierarchy";

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

describe("top pill on inner screens highlights the section (spec 10, Н1)", () => {
  it("client, job → Clients; lead, estimate, invoice → Sales; catalog → More", () => {
    const job = db.jobs[0]!;
    expect(sectionTab(`/client/${db.customers[0]!.id}`, {}, db, "director")).toBe("clients");
    expect(sectionTab(`/job/${job.id}`, {}, db, "director")).toBe("clients");
    expect(sectionTab(`/lead/${db.leads[0]!.id}`, {}, db, "director")).toBe("inbox");
    expect(sectionTab(`/estimate/${db.estimates[0]!.id}`, {}, db, "director")).toBe("inbox");
    expect(sectionTab(`/invoice/${db.invoices[0]!.id}`, {}, db, "director")).toBe("inbox");
    expect(sectionTab("/catalog/x", {}, db, "director")).toBe("more");
    expect(sectionTab("/figures/x", {}, db, "director")).toBe("today");
  });
  it("a section the role has no tab for lives under More; a role's own tab is itself", () => {
    expect(sectionTab(`/client/${db.customers[0]!.id}`, {}, db, "dispatcher")).toBe("more");
    expect(sectionTab(`/lead/${db.leads[0]!.id}`, {}, db, "tech")).toBe("more");
    expect(sectionTab("/plan", {}, db, "director")).toBe("more");
    expect(sectionTab("/plan", {}, db, "dispatcher")).toBe("plan");
    expect(sectionTab(`/visit/${db.visits[0]!.id}`, {}, db, "tech")).toBe("visits");
  });
  it("every tab it returns is one the role has", () => {
    const paths = ["/client/x", "/job/x", "/lead/x", "/estimate/x", "/invoice/x", "/receipt/x", "/visit/x", "/catalog/x", "/company/x", "/money", "/jobs", "/figures/x"];
    for (const role of ["director", "dispatcher", "tech"] as const)
      for (const p of paths) {
        const tab = sectionTab(p, {}, db, role);
        expect(tab === undefined || ["today", "triage", "inbox", "visits", "plan", "clients", "more"].includes(tab), `${role} ${p}`).toBe(true);
        if (tab) expect(roleHasTab(role, tab), `${role} ${p} → ${tab}`).toBe(true);
      }
  });
});

const roleHasTab = (role: "director" | "dispatcher" | "tech", tab: string) => roleNav[role].some((n) => n.route === tab);

/** every screen the layout run opens (e2e/specs/08-layouts.cjs SCREENS), with real ids from the seed */
const layoutSpec = fs.readFileSync(path.resolve(__dirname, "../e2e/specs/08-layouts.cjs"), "utf8");
const screenUrls = [...layoutSpec.slice(layoutSpec.indexOf("SCREENS = ["), layoutSpec.indexOf("];")).matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]!);

describe("sectionTab on every inner screen, three roles", () => {
  it("found the screens", () => expect(screenUrls.length).toBeGreaterThan(20));
  for (const role of ["director", "dispatcher", "tech"] as const)
    it(role, () => {
      for (const url of screenUrls) {
        const [p, q = ""] = url.split("?");
        const params = Object.fromEntries(new URLSearchParams(q));
        const ctx = navContext(p!, params, db, role);
        const tab = sectionTab(p!, params, db, role);
        if (p!.startsWith("/p/") || p!.startsWith("/auth")) expect(tab, `${role} ${url}`).toBeUndefined();
        // an inner screen (has a parent) always lights one of this role's tabs
        else if (ctx.up) expect(tab && roleHasTab(role, tab), `${role} ${url} → ${tab}`).toBe(true);
      }
    });
});
