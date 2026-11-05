/** Screens by role (route-guard): docs/specs/03 §8.1, docs/specs/05 §2, §4.2. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "../src/data/types";
import { canOpen, effectiveRole, roleHome, roleNav, routeKey, routeRoles } from "../src/nav/roles";

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
  it("every role opens its home and every tab of its bar", () => {
    for (const r of ROLES) {
      expect(canOpen(r, `/${roleHome[r]}`), `${r} home`).toBe(true);
      for (const n of roleNav[r]) expect(canOpen(r, `/${n.route}`), `${r} ${n.route}`).toBe(true);
      expect(canOpen(r, "/"), `${r} /`).toBe(true);
    }
  });
  it("the technician: no company money, Sales, Triage, Company or Team", () => {
    for (const p of ["/today", "/money", "/figures/profit?period=month", "/triage", "/inbox?tab=leads", "/team", "/company", "/company/hours"])
      expect(canOpen("tech", p), p).toBe(false);
  });
  it("the technician keeps his own work, estimates, catalog, and invoices/receipts for a payment on site", () => {
    for (const p of ["/visits", "/plan", "/clients", "/more", "/jobs", "/estimates", "/catalog", "/visit/v1", "/job/j1", "/invoice/i1", "/receipt/p1", "/expense/new", "/settings", "/p/abc"])
      expect(canOpen("tech", p), p).toBe(true);
  });
  it("Company settings and Team — director only; the office sees money", () => {
    for (const r of ["dispatcher", "sales", "tech"] as const) {
      expect(canOpen(r, "/team"), `${r} team`).toBe(false);
      expect(canOpen(r, "/company/profile"), `${r} company`).toBe(false);
    }
    expect(canOpen("director", "/team")).toBe(true);
    expect(canOpen("director", "/company")).toBe(true);
    for (const r of ["dispatcher", "director", "sales"] as const) expect(canOpen(r, "/money"), r).toBe(true);
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
