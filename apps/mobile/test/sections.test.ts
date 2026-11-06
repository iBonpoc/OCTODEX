/** The one list of sections (docs/specs/13 §2.1, §2.3, §4; 13а §3). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "../src/data/types";
import { canOpen, roleHome, routeKey } from "../src/nav/roles";
import { SECTIONS, menuGroups, sectionHref, sectionOfHref, tabs } from "../src/nav/sections";

const ROLES: Role[] = ["director", "dispatcher", "sales", "tech"];
const APP = path.join(__dirname, "../src/app");
const files = new Set(
  [...fs.readdirSync(APP), ...fs.readdirSync(path.join(APP, "(tabs)"))].filter((f) => !f.startsWith("_") && !f.startsWith("+")).map((f) => f.replace(/\.tsx$/, "")),
);
const menu = (r: Role) => menuGroups(r).flatMap((g) => g.items.map((i) => i.id));

describe("bottom tabs: the same 5 for every role (13 §2.1)", () => {
  it("Главная · План · Сообщения · Звонки · Клиенты", () => {
    for (const r of ROLES) expect(tabs(r).map((s) => s.id), r).toEqual(["home", "plan", "messages", "calls", "clients"]);
  });
  it("no «Ещё» and no «Продажи» tab any more", () => {
    for (const r of ROLES) expect(tabs(r).map((s) => s.label)).not.toContain("tab.more");
    expect(SECTIONS.some((s) => s.label === "tab.sales" || s.label === "tab.more")).toBe(false);
  });
  it("«Главная» opens the role's own home", () => {
    for (const r of ROLES) expect(sectionHref("home", r)).toBe(`/${roleHome[r]}`);
  });
});

describe("☰ by rights (13 §4)", () => {
  it("owner/admin: everything", () => {
    expect(menu("director")).toEqual(["home", "plan", "leads", "jobs", "clients", "estimates", "invoices", "catalog", "money", "team", "company", "settings"]);
  });
  it("office: no Team, no Company settings", () => {
    const m = menu("dispatcher");
    expect(m).not.toContain("team");
    expect(m).not.toContain("company");
    expect(m).toContain("money");
  });
  it("sales: no Payments/Reports (Money), Team, Company settings", () => {
    const m = menu("sales");
    for (const id of ["money", "team", "company"]) expect(m, id).not.toContain(id);
    expect(m).toContain("leads");
  });
  it("tech: no Leads, Invoices, Money, Team, Company settings; his estimates on /estimates", () => {
    const m = menu("tech");
    for (const id of ["leads", "invoices", "money", "team", "company"]) expect(m, id).not.toContain(id);
    expect(m).toContain("estimates");
    expect(sectionHref("estimates", "tech")).toBe("/estimates");
  });
  it("phone ☰ «Верх» = Создать · Главная; on 820/1280 the menu also has Messages and Calls (13 v2 §2.3, §2.5)", () => {
    expect(menuGroups("director")[0]!.items.map((s) => s.id)).toEqual(["home"]);
    expect(menuGroups("director", true)[0]!.items.map((s) => s.id)).toEqual(["home", "messages", "calls"]);
  });
  it("every item a role is shown, it may open (the route guard agrees)", () => {
    for (const r of ROLES) for (const id of menu(r)) expect(canOpen(r, sectionHref(id, r)), `${r} ${id}`).toBe(true);
  });
  it("groups in order, none empty", () => {
    for (const r of ROLES) {
      const g = menuGroups(r);
      expect(g.every((x) => x.items.length > 0)).toBe(true);
      expect(g[0]!.group).toBe("top");
      expect(g.at(-1)!.group).toBe("bottom");
    }
  });
});

describe("only what works (13 §2.3: no empty sections)", () => {
  it("every section opens a screen that exists", () => {
    for (const r of ROLES) for (const s of SECTIONS) expect(files.has(routeKey(sectionHref(s.id, r))), `${r} ${s.id} → ${sectionHref(s.id, r)}`).toBe(true);
  });
  it("an address lights its own item: /leads?tab=… → Leads, Estimates, Invoices; the old /inbox too", () => {
    expect(sectionOfHref("/leads?tab=leads")).toBe("leads");
    expect(sectionOfHref("/leads?tab=estimates")).toBe("estimates");
    expect(sectionOfHref("/inbox?tab=invoices")).toBe("invoices");
    expect(sectionOfHref("/triage")).toBe("home");
    expect(sectionOfHref("/calls")).toBe("calls");
  });
});
