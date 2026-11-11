/** Screens by role (route-guard): docs/specs/03 §8.1, docs/specs/05 §2, §4.2. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "../src/data/types";
import { canOpen, canSeeProfit, effectiveRole, roleHome, routeKey, routeRoles } from "../src/nav/roles";
import { menuGroups, sectionHref, tabs } from "../src/nav/sections";

const ROLES: Role[] = ["tech", "dispatcher", "director", "sales"];
const APP = path.join(__dirname, "../src/app");
/** first parts of every address the app has (tabs group included) */
const routes = new Set(
  [...fs.readdirSync(APP), ...fs.readdirSync(path.join(APP, "(tabs)"))]
    .filter((f) => !f.startsWith("_") && !f.startsWith("+") && !f.startsWith("("))
    .map((f) => f.replace(/\.tsx$/, "")),
);

describe("route-guard: who may open a screen", () => {
  it("every key of the table is a real screen (a renamed screen must not slip out of the guard)", () => {
    for (const k of Object.keys(routeRoles)) expect(routes.has(k), k).toBe(true);
  });
  it("every role opens its home, every tab and every ☰ item it is shown", () => {
    for (const r of ROLES) {
      expect(canOpen(r, `/${roleHome[r]}`), `${r} home`).toBe(true);
      for (const s of [...tabs(r), ...menuGroups(r).flatMap((g) => g.items)]) expect(canOpen(r, sectionHref(s.id, r)), `${r} ${s.id}`).toBe(true);
      expect(canOpen(r, "/"), `${r} /`).toBe(true);
    }
  });
  it("the technician: no company money, Sales, Triage, Company or Team", () => {
    for (const p of ["/today", "/money", "/figures/profit?period=month", "/triage", "/inbox?tab=leads", "/payments", "/payments?p=week", "/reports", "/reports/revenue", "/team", "/company", "/company/hours"])
      expect(canOpen("tech", p), p).toBe(false);
  });
  it("the technician opens «Лиды» — his own (13 §2.3); /inbox, the office's old address, stays closed", () => {
    expect(canOpen("tech", "/leads")).toBe(true);
    expect(canOpen("tech", "/leads?tab=leads")).toBe(true);
    expect(canOpen("tech", "/inbox")).toBe(false);
  });
  it("the technician keeps his own work, estimates, catalog, and invoices/receipts for a payment on site", () => {
    for (const p of ["/visits", "/plan", "/messages", "/calls", "/clients", "/more", "/jobs", "/estimates", "/catalog", "/visit/v1", "/job/j1", "/invoice/i1", "/receipt/p1", "/expense/new", "/settings", "/p/abc"])
      expect(canOpen("tech", p), p).toBe(true);
  });
  it("Team — director only; Company settings — director and the office (read-only, spec 26 §3); the office sees money", () => {
    for (const r of ["dispatcher", "sales", "tech"] as const) expect(canOpen(r, "/team"), `${r} team`).toBe(false);
    for (const r of ["sales", "tech"] as const) expect(canOpen(r, "/company/profile"), `${r} company`).toBe(false);
    expect(canOpen("dispatcher", "/company")).toBe(true);
    expect(canOpen("dispatcher", "/company/profile")).toBe(true);
    expect(canOpen("director", "/team")).toBe(true);
    expect(canOpen("director", "/company")).toBe(true);
    for (const r of ["dispatcher", "director", "sales"] as const) expect(canOpen(r, "/money"), r).toBe(true);
  });
  it("Payments: owner, admin, office — not sales, not the technician (13 §4); the invoices list is open to sales", () => {
    for (const r of ["dispatcher", "director"] as const) expect(canOpen(r, "/payments"), r).toBe(true);
    for (const r of ["sales", "tech"] as const) expect(canOpen(r, "/payments"), r).toBe(false);
    for (const r of ["dispatcher", "director", "sales"] as const) expect(canOpen(r, "/invoice?f=owed"), r).toBe(true);
    for (const r of ["dispatcher", "director"] as const) expect(canOpen(r, "/reports/revenue"), r).toBe(true);
    for (const r of ["sales", "tech"] as const) expect(canOpen(r, "/reports"), r).toBe(false);
  });
  it("address → key", () => {
    expect(routeKey("/")).toBe("");
    expect(routeKey("/company/hours?wizard=1")).toBe("company");
    expect(routeKey("/money#x")).toBe("money");
  });
});

describe("effective role (bug: «/» opened My visits for the owner and the office)", () => {
  it("a role this person does not have becomes their first role", () => {
    // the office (appRoles office = [dispatcher]) with the old default "tech"
    expect(effectiveRole("tech", ["dispatcher"])).toBe("dispatcher");
    expect(effectiveRole("director", ["tech"])).toBe("tech");
  });
  it("a role they have stays (the owner switched to Technician on purpose)", () => {
    expect(effectiveRole("tech", ["director", "dispatcher", "tech"])).toBe("tech");
    expect(effectiveRole("sales", ROLES)).toBe("sales");
  });
});

describe("«Прибыль» by right (docs/specs/13 §3.4, §4)", () => {
  it("the technician and sales never see a job's profit; owner, admin and office do (#868)", () => {
    expect(canSeeProfit("tech")).toBe(false);
    expect(canSeeProfit("sales")).toBe(false); // before: true — sales saw «Прибыль» from the company's expenses
    for (const r of ["dispatcher", "director"] as Role[]) expect(canSeeProfit(r)).toBe(true);
  });
  it("job and visit screens both ask canSeeProfit before showing jobProfit (failed before: the visit showed it to the tech)", () => {
    for (const f of ["job/[id].tsx", "visit/[id].tsx"]) {
      const src = fs.readFileSync(path.join(APP, f), "utf8");
      expect(src, f).toMatch(/canSeeProfit\(store\.role\)/);
    }
  });
});
