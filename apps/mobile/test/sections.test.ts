/** The one list of sections (docs/specs/13 §2.1, §2.3, §4; 13а §3). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "../src/data/types";
import { canOpen, roleHome, routeKey } from "../src/nav/roles";
import { moreHref } from "../src/nav/sections";
import { SECTIONS, TAB_ORDER, meIsSub, menuGroups, sectionHref, sectionOfHref, tabOf, tabs } from "../src/nav/sections";

const ROLES: Role[] = ["director", "dispatcher", "sales", "tech"];
const APP = path.join(__dirname, "../src/app");
const files = new Set(
  [...fs.readdirSync(APP), ...fs.readdirSync(path.join(APP, "(tabs)"))].filter((f) => !f.startsWith("_") && !f.startsWith("+")).map((f) => f.replace(/\.tsx$/, "")),
);
const menu = (r: Role) => menuGroups(r).flatMap((g) => g.items.map((i) => i.id));

describe("bottom tabs: the same 5 for the office (13 v2 §2.1, variant Б); the tech — his own 4 (audit 12 §2.6)", () => {
  it("Главная · План · Клиенты · Деньги · Лиды (prototype v2); search is not a tab, «Ещё» is the avatar", () => {
    for (const r of ROLES.filter((x) => x !== "tech")) expect(tabs(r).map((s) => s.id), r).toEqual(["home", "plan", "clients", "finance", "leads"]);
    expect(TAB_ORDER).toEqual(["home", "plan", "clients", "finance", "leads"]);
    expect(SECTIONS.some((s) => (s.id as string) === "search")).toBe(false);
    for (const r of ROLES) expect(tabs(r).map((s) => s.id)).not.toContain("more");
  });
  it("the tech: no «Деньги» (the company's money is not his — his estimates are a tile of «Ещё»): Мой день · План · Клиенты · Лиды", () => {
    expect(tabs("tech").map((s) => s.id)).toEqual(["home", "plan", "clients", "leads"]);
    expect(tabOf("estimates", "tech")).toBeUndefined();
  });
  it("a subcontractor never gets leads (noSub): 3 tabs", () => {
    expect(tabs("tech", false, true).map((s) => s.id)).toEqual(["home", "plan", "clients"]);
    expect(tabs("tech", true, true).map((s) => s.id)).toEqual(["home", "clients"]);
  });
  it("the lit tab: the money lists light «Деньги», a lead «Лиды», a section of «Ещё» none", () => {
    for (const id of ["estimates", "invoices", "payments", "money", "finance"] as const) expect(tabOf(id, "director"), id).toBe("finance");
    expect(tabOf("leads", "director")).toBe("leads");
    expect(tabOf("leads", "tech", false, true)).toBeUndefined();
    for (const id of ["jobs", "catalog", "settings", "messages", undefined] as const) expect(tabOf(id, "director"), String(id)).toBeUndefined();
    expect(tabOf("plan", "director")).toBe("plan");
    expect(tabOf("plan", "director", true)).toBeUndefined();
  });
  it("no «Продажи» and no «Звонки» tab (until the own number)", () => {
    for (const r of ROLES) expect(tabs(r).map((s) => s.id)).not.toContain("calls");
    expect(SECTIONS.some((s) => s.label === "tab.sales")).toBe(false);
  });
  it("«Главная» opens the role's own home", () => {
    for (const r of ROLES) expect(sectionHref("home", r)).toBe(`/${roleHome[r]}`);
  });
});

describe("a module's tab takes the place of «План» (founder 16.11, #1487; DS §5.3)", () => {
  it("with a module's tab: four core tabs — «План» is not one; the bar stays at five with the module's", () => {
    for (const r of ROLES) expect(tabs(r, true).map((s) => s.id), r).toEqual(r === "tech" ? ["home", "clients", "leads"] : ["home", "clients", "finance", "leads"]);
  });
  it("«План» is a tile in «Ещё» then, and only then; the side menu (820/1280) has it either way", () => {
    for (const r of ROLES) {
      const tiles = (mod: boolean) => menuGroups(r, false, false, mod).flatMap((g) => g.items.map((i) => i.id));
      expect(tiles(true), r).toContain("plan");
      expect(tiles(false), r).not.toContain("plan");
      const side = (mod: boolean) => menuGroups(r, true, false, mod).flatMap((g) => g.items.map((i) => i.id));
      expect(side(true), r).toEqual(side(false));
    }
  });
  it("one word for the messages: the tab has no shorter name of its own («Чаты» / «Сообщения» was two words)", () => {
    const m = SECTIONS.find((s) => s.id === "messages")!;
    expect(Object.keys(m)).not.toContain("tabLabel");
    const src = fs.readFileSync(path.join(__dirname, "../src/nav/TabBar.tsx"), "utf8");
    expect(src).not.toMatch(/tabLabel/);
  });
});

describe("«Ещё» (phone) and the side menu (820/1280) by rights (13 §2.3, §4)", () => {
  it("owner/admin «Ещё»: everything but the tabs", () => {
    expect(menu("director")).toEqual(["messages", "jobs", "calls", "tasks", "estimates", "invoices", "catalog", "suppliers", "purchase-orders", "payments", "reports", "money", "team", "company", "settings", "help"]);
  });
  it("the side menu: the tabs too, but never «Ещё» itself", () => {
    const side = menuGroups("director", true).flatMap((g) => g.items.map((i) => i.id));
    expect(side).toEqual(["home", "messages", "plan", "leads", "jobs", "clients", "calls", "tasks", "estimates", "invoices", "catalog", "suppliers", "purchase-orders", "payments", "reports", "money", "team", "company", "settings", "help"]);
    expect(side).not.toContain("more");
  });
  it("office: no Team; Company settings to read (spec 26 §3: only the director changes them)", () => {
    const m = menu("dispatcher");
    expect(m).not.toContain("team");
    expect(m).toContain("company");
    expect(m).toContain("money");
    expect(m).toContain("payments");
    expect(m).toContain("reports");
    // spec 36: the office keeps the suppliers
    expect(m).toContain("suppliers");
  });
  it("sales: no Payments/Reports (Money), Team, Company settings", () => {
    const m = menu("sales");
    for (const id of ["money", "payments", "reports", "team", "company", "suppliers", "purchase-orders"]) expect(m, id).not.toContain(id);
    expect(m).toContain("invoices");
    // Leads is a tab now, not a row of «Ещё»; the side menu has it
    expect(m).not.toContain("leads");
    expect(menuGroups("sales", true).flatMap((g) => g.items.map((i) => i.id))).toContain("leads");
  });
  it("tech: his own Leads (13 §2.3, a tab); no Invoices, Money, Team, Company settings; his estimates on /estimates", () => {
    const m = menu("tech");
    expect(tabs("tech").map((s) => s.id)).toContain("leads");
    expect(sectionHref("leads", "tech")).toBe("/leads?tab=leads");
    for (const id of ["invoices", "payments", "reports", "money", "team", "company", "suppliers", "purchase-orders"]) expect(m, id).not.toContain(id);
    expect(m).toContain("estimates");
    expect(sectionHref("estimates", "tech")).toBe("/estimates");
  });
  it("a subcontractor (app role «tech», Member.kind «sub»): no Leads in «Ещё» nor in the side menu; the rest as a tech", () => {
    const sub = (wide: boolean) => menuGroups("tech", wide, true).flatMap((g) => g.items.map((i) => i.id));
    for (const wide of [false, true]) {
      expect(sub(wide), `wide ${wide}`).not.toContain("leads");
      expect(sub(wide), `wide ${wide}`).toEqual(menuGroups("tech", wide).flatMap((g) => g.items.map((i) => i.id)).filter((id) => id !== "leads"));
    }
    expect(meIsSub({ me: "m-sub", members: [{ id: "m-sub", kind: "sub" }] })).toBe(true);
    expect(meIsSub({ me: "m-ivan", members: [{ id: "m-ivan", kind: "employee" }, { id: "m-sub", kind: "sub" }] })).toBe(false);
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
  it("«Ещё» starts with «Верх» (Сообщения — not a tab); the side menu starts with Главная · Сообщения", () => {
    expect(menuGroups("director")[0]!.group).toBe("top");
    expect(menuGroups("director")[0]!.items.map((s) => s.id)).toEqual(["messages"]);
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
  it("«Ещё» → a section on a tab screen: «from=more» for the office, the sales home as it is (docs/specs/28 §3)", () => {
    expect(moreHref("leads", "director")).toBe("/leads?tab=leads&from=more");
    // «Сметы» is a section of its own, a stack screen for every role (spec 31 §7а): its own «‹ Ещё», no «from»
    expect(moreHref("estimates", "dispatcher")).toBe("/estimates");
    // sales: Leads is the home — no «‹ Ещё» there
    expect(moreHref("leads", "sales")).toBe("/leads?tab=leads");
    // a stack screen already has its own «‹ Ещё» and back
    expect(moreHref("jobs", "director")).toBe("/jobs");
    expect(moreHref("estimates", "tech")).toBe("/estimates");
  });
});
