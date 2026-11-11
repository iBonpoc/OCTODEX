/** unit:fab — «＋» by screen and role (docs/specs/13 v2 §2.4, 13а §9), the sync badge (§2.6), the bell (§3.14). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DB, Notice, Role } from "../src/data/types";
import { makeSeed } from "../src/data/seed";
import { canOpen } from "../src/nav/roles";
import { FAB_SETS, fabItems, type FabSet } from "../src/nav/sections";
import { syncState } from "../src/nav/shell";
import { bellNotices, noticeHref, unreadCount } from "../src/nav/notices";

const ROLES: Role[] = ["director", "dispatcher", "sales", "tech"];
const SETS = Object.keys(FAB_SETS) as FabSet[];
const FULL = { customerId: "c1", propertyId: "p1", jobId: "j1", visitId: "v1", leadId: "l1" };
const ids = (set: FabSet, role: Role, ctx = {}) => fabItems(set, role, ctx).map((i) => i.id);

const APP = path.join(__dirname, "../src/app");
const routeExists = (href: string) => {
  const p = href.split("?")[0]!.replace(/^\//, "");
  return fs.existsSync(path.join(APP, `${p}.tsx`)) || fs.existsSync(path.join(APP, "(tabs)", `${p}.tsx`));
};

describe("unit:fab — the sets (13 §2.4, only what works)", () => {
  it("Главная / «＋ Создать»: office — Лид · Клиент · Смета · Работа · Расход; tech — Лид · Расход", () => {
    for (const r of ["director", "dispatcher", "sales"] as Role[]) expect(ids("home", r), r).toEqual(["lead", "client", "estimate", "job", "expense"]);
    expect(fabItems("home", "director").find((i) => i.id === "job")!.href).toBe("/job/new");
    expect(ids("home", "tech")).toEqual(["lead", "expense"]);
  });
  it("План: planners — Работа · Лид · Записать в план · Событие · Выходной; sales — Работа · Лид (без даты, S17); tech — no «＋» (Р7)", () => {
    expect(ids("plan", "director")).toEqual(["job", "lead", "planAdd", "planEvent", "planTimeOff"]);
    expect(ids("plan", "dispatcher")).toEqual(["job", "lead", "planAdd", "planEvent", "planTimeOff"]);
    expect(ids("plan", "sales")).toEqual(["job", "lead"]);
    for (const it of fabItems("plan", "director").filter((i) => i.id.startsWith("plan"))) expect(it.href, it.id).toBeUndefined();
    expect(fabItems("plan", "director").find((i) => i.id === "planEvent")!.act).toBe("planEvent");
    expect(fabItems("plan", "director").find((i) => i.id === "planTimeOff")!.act).toBe("planTimeOff");
    expect(ids("plan", "tech")).toEqual([]);
  });
  it("Клиенты: office — Клиент; tech — none", () => {
    expect(ids("clients", "director")).toEqual(["client"]);
    expect(ids("clients", "tech")).toEqual([]);
  });
  it("Звонки: office — Записать звонок · Лид · Клиент; tech — Записать звонок · Лид", () => {
    expect(ids("calls", "dispatcher")).toEqual(["call", "lead", "client"]);
    expect(ids("calls", "tech")).toEqual(["call", "lead"]);
  });
  it("Клиент: the job and the estimate are tied to the client; nothing to tie to — no item", () => {
    const [it, jb] = fabItems("client", "director", { customerId: "c1" }); // #1094: the estimate first
    expect(jb).toMatchObject({ id: "job", href: "/job/new?customerId=c1" });
    expect(it).toMatchObject({ id: "estimate", href: "/estimate/new?customerId=c1" });
    expect(fabItems("client", "director", { customerId: "c1", propertyId: "p1" })[1]!.href).toBe("/job/new?customerId=c1&propertyId=p1");
    expect(ids("client", "director")).toEqual([]);
    expect(ids("client", "tech", { customerId: "c1" })).toEqual([]);
  });
  it("Объект: the same «＋» as the client, tied to the client and this property (20 §6-4, S17 / S5)", () => {
    const ctx = { customerId: "c1", propertyId: "p1" };
    expect(fabItems("client", "director", ctx).map((i) => i.href)).toEqual(["/estimate/new?customerId=c1&propertyId=p1", "/job/new?customerId=c1&propertyId=p1"]);
    // the screen declares it only for a client that may be served (both of its screens: the card and a row's list)
    const src = fs.readFileSync(path.join(APP, "property/[id].tsx"), "utf8");
    expect(src.match(/fab=\{servable \? "client" : undefined\}/g)?.length).toBe(2);
    expect(src.match(/fabCtx=\{\{ customerId: p\.customerId, propertyId: p\.id \}\}/g)?.length).toBe(2);
    expect(src).toMatch(/const servable = canServe\(db, p\.customerId\)/);
  });
  it("Работа: planners — Выезд · Смета (client and property); tech — Расход", () => {
    const items = fabItems("job", "director", FULL);
    expect(items.map((i) => i.id)).toEqual(["visit", "estimate"]);
    expect(items[0]!.href).toBe("/job/schedule?jobId=j1");
    expect(items[1]!.href).toBe("/estimate/new?customerId=c1&propertyId=p1&leadId=l1");
    expect(ids("job", "sales", FULL)).toEqual(["estimate"]);
    expect(ids("job", "tech", FULL)).toEqual(["expense"]);
  });
  it("Выезд: tech — Фото · Лид · Расход; on an inspection also Смета; the office — Смета on an inspection only", () => {
    expect(ids("visit", "tech", FULL)).toEqual(["photo", "lead", "expense"]);
    expect(ids("visit", "tech", { ...FULL, inspection: true })).toEqual(["photo", "estimate", "lead", "expense"]);
    expect(ids("visit", "director", FULL)).toEqual([]);
    expect(ids("visit", "director", { ...FULL, inspection: true })).toEqual(["estimate"]);
  });
  it("every item opens a screen that exists and the role may open (no empty screens, 14-app-store п. 7)", () => {
    for (const s of SETS)
      for (const r of ROLES)
        for (const it of fabItems(s, r, { ...FULL, inspection: true })) {
          if (!it.href) {
            expect(it.act, `${s} ${r} ${it.id}`).toBeTruthy();
            continue;
          }
          expect(routeExists(it.href), `${s} ${r} ${it.href}`).toBe(true);
          expect(canOpen(r, it.href), `${s} ${r} ${it.href}`).toBe(true);
        }
  });
  it("no «coming in wave N» items: Note, File are not offered yet (Task — wave 6)", () => {
    for (const s of SETS) for (const r of ROLES) for (const it of fabItems(s, r, FULL)) expect(["lead", "client", "job", "estimate", "expense", "visit", "planAdd", "planEvent", "planTimeOff", "photo", "task", "call", "message"]).toContain(it.id);
  });
});

describe("unit:fab — the sync badge (13 §2.6)", () => {
  it("only with something to say", () => {
    expect(syncState(true, 0)).toBeNull();
    expect(syncState(false, 0)).toBe("offline");
    expect(syncState(false, 3)).toBe("offline");
    expect(syncState(true, 2)).toBe("sending");
  });
});

describe("unit:fab — the bell (13 §3.14)", () => {
  const base = makeSeed();
  const N = (id: string, p: Partial<Notice>): Notice => ({ id, kind: "estimate.viewed", customer: "X", at: "2026-11-05T10:00:00Z", ...p });
  const db = { ...base, visits: [], notices: [N("a", { read: true }), N("b", { at: "2026-11-05T12:00:00Z" }), N("c", {})] } as DB;
  it("unread first (newest first), read below; the count is the unread", () => {
    const { unread, read } = bellNotices(db, "director");
    expect(unread.map((n) => n.id)).toEqual(["b", "c"]);
    expect(read.map((n) => n.id)).toEqual(["a"]);
    expect(unreadCount(db, "director")).toBe(2);
  });
  it("the technician: no client or money notices", () => {
    expect(unreadCount(db, "tech")).toBe(0);
    expect(bellNotices(db, "tech").read).toEqual([]);
  });
  it("each notice opens its object", () => {
    expect(noticeHref(N("x", { estimateId: "e5" }))).toBe("/estimate/e5");
    expect(noticeHref(N("x", { kind: "invoice.paid", jobId: "j1" }))).toBe("/job/j1");
    expect(noticeHref(N("x", { kind: "visit.late", visitId: "v1" }))).toBe("/visit/v1");
  });
});
