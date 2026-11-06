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

describe("bottom tabs: the same 5 for every role (13 v2 §2.1, variant Б)", () => {
  it("Главная · План · Сообщения · Клиенты · Ещё", () => {
    for (const r of ROLES) expect(tabs(r).map((s) => s.id), r).toEqual(["home", "plan", "messages", "clients", "more"]);
  });
  it("no «Продажи» and no «Звонки» tab (until the own number)", () => {
    for (const r of ROLES) expect(tabs(r).map((s) => s.id)).not.toContain("calls");
    expect(SECTIONS.some((s) => s.label === "tab.sales")).toBe(false);
  });
  it("«Главная» opens the role's own home", () => {
    for (const r of ROLES) expect(sectionHref("home", r)).toBe(`/${roleHome[r]}`);
  });
});

describe("«Ещё» (phone) and the side menu (820/1280) by rights (13 §2.3, §4)", () => {
  it("owner/admin «Ещё»: everything but the tabs", () => {
    expect(menu("director")).toEqual(["leads", "jobs", "calls", "tasks", "estimates", "invoices", "catalog", "payments", "reports", "money", "team", "company", "settings", "help"]);
  });
  it("the side menu: the tabs too, but never «Ещё» itself", () => {
    const side = menuGroups("director", true).flatMap((g) => g.items.map((i) => i.id));
    expect(side).toEqual(["home", "messages", "plan", "leads", "jobs", "clients", "calls", "tasks", "estimates", "invoices", "catalog", "payments", "reports", "money", "team", "company", "settings", "help"]);
    expect(side).not.toContain("more");
  });
  it("office: no Team, no Company settings", () => {
    const m = menu("dispatcher");
    expect(m).not.toContain("team");
    expect(m).not.toContain("company");
    expect(m).toContain("money");
    expect(m).toContain("payments");
    expect(m).toContain("reports");
  });
  it("sales: no Payments/Reports (Money), Team, Company settings", () => {
    const m = menu("sales");
    for (const id of ["money", "payments", "reports", "team", "company"]) expect(m, id).not.toContain(id);
    expect(m).toContain("invoices");
    expect(m).toContain("leads");
  });
  it("tech: no Leads, Invoices, Money, Team, Company settings; his estimates on /estimates", () => {
    const m = menu("tech");
    for (const id of ["leads", "invoices", "payments", "reports", "money", "team", "company"]) expect(m, id).not.toContain(id);
    expect(m).toContain("estimates");
    expect(sectionHref("estimates", "tech")).toBe("/estimates");
  });
  it("«Счета» opens the one invoices list /invoice (18 §1), «Оплаты» — /payments; both in their groups", () => {
    for (const r of ["director", "dispatcher", "sales"] as const) expect(sectionHref("invoices", r), r).toBe("/invoice");
    expect(sectionHref("payments", "director")).toBe("/payments");
    expect(sectionOfHref("/invoice")).toBe("invoices");
    expect(sectionOfHref("/invoice?f=owed")).toBe("invoices");
    expect(sectionOfHref("/payments?p=week")).toBe("payments");
    // «Деньги»: Оплаты · Отчёты · Расходы (13 §2.3); «Расходы» is the /money screen
    expect(menuGroups("director").find((g) => g.group === "money")!.items.map((s) => s.id)).toEqual(["payments", "reports", "money"]);
    expect(sectionHref("reports", "director")).toBe("/reports");
    expect(SECTIONS.find((s) => s.id === "money")!.label).toBe("nav.expenses");
    expect(sectionOfHref("/reports")).toBe("reports");
  });
  it("«Ещё» has no «Верх» group (Главная and Сообщения are tabs); the side menu starts with Главная · Сообщения", () => {
    expect(menuGroups("director")[0]!.group).toBe("work");
    expect(menuGroups("director", true)[0]!.items.map((s) => s.id)).toEqual(["home", "messages"]);
  });
  it("every item a role is shown, it may open (the route guard agrees)", () => {
    for (const r of ROLES) for (const id of menu(r)) expect(canOpen(r, sectionHref(id, r)), `${r} ${id}`).toBe(true);
  });
  it("groups in order, none empty", () => {
    for (const r of ROLES) {
      const g = menuGroups(r);
      expect(g.every((x) => x.items.length > 0)).toBe(true);
      expect(menuGroups(r, true)[0]!.group).toBe("top");
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
