import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { menuGroups, tabs } from "../src/nav/sections";
import { canOpen } from "../src/nav/roles";
import fs from "node:fs";
import path from "node:path";
import { activeSection, breadcrumbs, collapseCrumbs, navContext } from "../src/nav/hierarchy";

const db = makeSeed();
const hrefs = (p: string, params = {}, role: "director" | "dispatcher" | "tech" = "director") => breadcrumbs(p, params, db, role).map((c) => c.href);

describe("breadcrumbs: Home › … › Parent (founder, 05.11.2026)", () => {
  it("client card: Today › Clients", () => {
    const cust = db.customers[0]!;
    const t = breadcrumbs(`/client/${cust.id}`, {}, db, "director");
    expect(t.map((c) => c.href)).toEqual(["/today", "/clients"]);
    expect(t[0]).toMatchObject({ home: true, label: { key: "nav.home" } });
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
    expect(hrefs("/catalog/x", {}, "dispatcher")).toEqual(["/triage", "/catalog"]);
  });
  it("the tech's lead goes up to his «Лиды» (13 §2.3), which lights its own item", () => {
    const l = db.leads[0]!;
    expect(hrefs(`/lead/${l.id}`, {}, "tech")).toEqual(["/visits", "/leads?tab=leads"]);
    expect(activeSection(`/lead/${l.id}`, {}, db, "tech")).toBe("leads");
    expect(activeSection("/leads", {}, db, "tech")).toBe("leads");
  });
  it("receipt: the whole Sales chain, query links (Leads tab) followed", () => {
    const pay = db.payments.find((p) => p.invoiceId)!;
    const t = hrefs(`/receipt/${pay.id}`);
    expect(t[0]).toBe("/today");
    expect(t.at(-1)).toBe(`/invoice/${pay.invoiceId}`);
    expect(new Set(t).size).toBe(t.length);
  });
  it("tab roots and pages without a parent have no trail", () => {
    for (const p of ["/today", "/clients", "/plan", "/messages", "/calls", "/p/x"]) expect(hrefs(p)).toEqual([]);
    // ☰ roots have no trail; another role's home sits under this role's home (13а §3: no «More» any more)
    expect(hrefs("/jobs")).toEqual([]);
    expect(hrefs("/leads")).toEqual([]);
    expect(hrefs("/triage")).toEqual(["/today"]);
  });
  it("a company section ends with its own name, not «Настройки компании» again (fails before: kind was co.title)", () => {
    expect(navContext("/company/address", {}, db, "director")).toMatchObject({ kind: "co.step.address", up: { href: "/company" } });
    expect(navContext("/company/profile", {}, db, "director").kind).toBe("co.step.profile");
    expect(navContext("/company/schedule", {}, db, "director").kind).toBe("schs.title");
    expect(hrefs("/company/address")).toEqual(["/today", "/company"]);
  });
  it("phone folds a long trail into Home › … › Parent", () => {
    expect(collapseCrumbs([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: [], at: -1 });
    expect(collapseCrumbs([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 5], hidden: [2, 3, 4], at: 1 });
  });
});

describe("the lit section of a screen (tab or ☰ item; spec 10 Н1, 13 §2)", () => {
  it("client, job → Clients; lead → Leads; estimate → Estimates; invoice → Invoices; catalog → Catalog", () => {
    const job = db.jobs[0]!;
    expect(activeSection(`/client/${db.customers[0]!.id}`, {}, db, "director")).toBe("clients");
    expect(activeSection(`/job/${job.id}`, {}, db, "director")).toBe("clients");
    expect(activeSection(`/lead/${db.leads[0]!.id}`, {}, db, "director")).toBe("leads");
    expect(activeSection(`/estimate/${db.estimates[0]!.id}`, {}, db, "director")).toBe("estimates");
    expect(activeSection(`/invoice/${db.invoices[0]!.id}`, {}, db, "director")).toBe("invoices");
    expect(activeSection("/catalog/x", {}, db, "director")).toBe("catalog");
    expect(activeSection("/figures/x", {}, db, "director")).toBe("home");
  });
  it("every home screen lights «Главная»; the lists on /leads light their own item", () => {
    for (const p of ["/today", "/triage", "/visits"]) expect(activeSection(p, {}, db, "director"), p).toBe("home");
    expect(activeSection("/leads", { tab: "invoices" }, db, "director")).toBe("invoices");
    expect(activeSection("/leads", {}, db, "director")).toBe("leads");
    expect(activeSection(`/visit/${db.visits[0]!.id}`, {}, db, "tech")).toBe("home");
    expect(activeSection("/plan", {}, db, "dispatcher")).toBe("plan");
  });
});

/** the role has this section as a tab or in its ☰ */
const roleHasSection = (role: "director" | "dispatcher" | "tech", id: string) =>
  tabs(role).some((s) => s.id === id) || menuGroups(role).some((g) => g.items.some((s) => s.id === id));

/** every screen the layout run opens (e2e/specs/08-layouts.cjs SCREENS), with real ids from the seed */
const layoutSpec = fs.readFileSync(path.resolve(__dirname, "../e2e/specs/08-layouts.cjs"), "utf8");
const screenUrls = [...layoutSpec.slice(layoutSpec.indexOf("SCREENS = ["), layoutSpec.indexOf("];")).matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]!);

describe("activeSection on every inner screen, three roles", () => {
  it("found the screens", () => expect(screenUrls.length).toBeGreaterThan(20));
  for (const role of ["director", "dispatcher", "tech"] as const)
    it(role, () => {
      for (const url of screenUrls) {
        const [p, q = ""] = url.split("?");
        const params = Object.fromEntries(new URLSearchParams(q));
        const ctx = navContext(p!, params, db, role);
        const sec = activeSection(p!, params, db, role);
        if (p!.startsWith("/p/") || p!.startsWith("/auth")) expect(sec, `${role} ${url}`).toBeUndefined();
        // an inner screen (has a parent) always lights one of this role's sections
        // (a screen the role may not open is closed by the route guard — nothing is lit for it)
        else if (ctx.up && canOpen(role, url)) expect(sec && roleHasSection(role, sec), `${role} ${url} → ${sec}`).toBe(true);
      }
    });
});
