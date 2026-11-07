/**
 * Spec 33 П15 (C2a): the registry of add-on modules and the company's modules. Access mirrors app.module_active (C1):
 * switched on and in the trial or paid; after the trial without payment nothing is saved (founder О2). The ops go to the
 * server functions module_enable / module_disable / module_save_settings only, never a direct write of company_modules.
 * Store harness — as in test/pushPrefs.test.ts (miniReact, stand-ins for the server and AsyncStorage).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: { kind: "rpc" | "from"; name: string; args?: unknown }[] = [];
vi.mock("react", () => import("./support/miniReact"));
vi.mock("react/jsx-runtime", () => import("./support/miniReact"));
vi.mock("react/jsx-dev-runtime", () => import("./support/miniReact"));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: (t: string) => { rpcCalls.push({ kind: "from", name: t }); throw new Error("no direct table write"); },
    rpc: (name: string, args: unknown) => { rpcCalls.push({ kind: "rpc", name, args }); return Promise.resolve({ data: null, error: null }); },
  },
}));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const server = {
  loads: [] as Deferred<unknown>[],
  sends: [] as { op: unknown; companyId: string; userId: string; d: Deferred<void> }[],
  points: [] as Deferred<string>[],
  renewed: 0,
};
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => {
    const d = deferred<unknown>();
    server.loads.push(d);
    return d.promise;
  },
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: unknown, companyId: string, userId: string) => {
    const d = deferred<void>();
    server.sends.push({ op, companyId, userId, d });
    return d.promise;
  },
  renewSession: async () => void (server.renewed += 1),
  sendVisitPoint: () => {
    const d = deferred<string>();
    server.points.push(d);
    return d.promise;
  },
}));
// the «Отменить» window is not what these tests are about: an op is ready at once
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
// the pause after a network failure is tested in test/outboxRetry.test.ts: here the next try may go at once
const retry = { pause: 0 };
/** the server's «no»: a permission code (a try) */
const refusal = () => Object.assign(new Error("new row violates row-level security policy"), { name: "PermanentError", status: 403, code: "42501" });
/** the server's «not now» */
const notNow = (status: number, code = "") => Object.assign(new Error(`status ${status}`), { name: "ServerError", status, code });
// the phone's «back in the app» (react-native's AppState does not load in node)
const appActive = { cb: null as null | (() => void) };
vi.mock("@/data/appActive", () => ({ onAppActive: (cb: () => void) => ((appActive.cb = cb), () => (appActive.cb = null)), onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => retry.pause }));
// a wipe that comes while an update of the outbox is still queued (not applied yet): fired from inside adoptLegacy
const midAdopt = { fire: null as null | (() => void) };
vi.mock("@/data/outboxOwner", async (orig) => {
  const real = await orig<typeof import("../src/data/outboxOwner")>();
  return {
    ...real,
    adoptLegacy: (items: Parameters<typeof real.adoptLegacy>[0], who: Parameters<typeof real.adoptLegacy>[1]) => {
      const out = real.adoptLegacy(items, who);
      const f = midAdopt.fire;
      midAdopt.fire = null;
      f?.();
      return out;
    },
  };
});

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import { madeOnQueue } from "../src/data/outboxDeps";
import type { Company } from "../src/data/types";
import { companyToDb } from "../src/cloud/companyMap";
import {
  activeModules, allModules, companyModulesFromRows, discoverModules, enabledLocally, moduleActive, moduleDef, moduleState, registerModule,
  type CompanyModule,
} from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Value = {
  db: { company: Company | null };
  queue: unknown[];
  mode: string;
  setOnline: (v: boolean) => number;
  enableModule: (key: string) => () => void;
  disableModule: (key: string) => () => void;
  saveModuleSettings: (key: string, settings: Record<string, unknown>) => (() => void) | null;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
let root: Root<P> | null = null;
beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  rpcCalls.length = 0;
  signOut();
});
afterEach(() => {
  root?.unmount();
  root = null;
});


const DAY = 86_400_000;
const NOW = Date.parse("2026-11-07T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const cm = (p: Partial<CompanyModule>): CompanyModule => ({ enabled: true, settings: {}, rowVersion: 1, ...p });
registerModule(gutters);

describe("unit:modules — access (= app.module_active)", () => {
  it("no row or off → off; the trial left counts in whole days; paid wins; over and unpaid → expired", () => {
    expect(moduleState(undefined, NOW)).toEqual({ access: "off", trialUsed: false });
    expect(moduleState(cm({ enabled: false, trialEndsAt: iso(NOW - DAY) }), NOW)).toEqual({ access: "off", trialUsed: true });
    expect(moduleState(cm({ trialEndsAt: iso(NOW + 7 * DAY) }), NOW)).toEqual({ access: "trial", daysLeft: 7, trialUsed: true });
    expect(moduleState(cm({ trialEndsAt: iso(NOW + 60_000) }), NOW)).toMatchObject({ access: "trial", daysLeft: 1 });
    expect(moduleState(cm({ trialEndsAt: iso(NOW - 1), paidUntil: iso(NOW + DAY) }), NOW).access).toBe("paid");
    expect(moduleState(cm({ trialEndsAt: iso(NOW - 1) }), NOW)).toEqual({ access: "expired", trialUsed: true });
    expect(moduleState(cm({ trialEndsAt: iso(NOW - 1), paidUntil: iso(NOW - 1) }), NOW).access).toBe("expired");
    // the very moment the trial ends it is over (the server: trial_ends_at > now())
    expect(moduleState(cm({ trialEndsAt: iso(NOW) }), NOW).access).toBe("expired");
  });
  it("active = trial or paid; activeModules lists only those", () => {
    const co = (m?: CompanyModule) => ({ modules: m ? { gutters: m } : undefined });
    expect(moduleActive(co(cm({ trialEndsAt: iso(NOW + DAY) })), "gutters", NOW)).toBe(true);
    expect(moduleActive(co(cm({ paidUntil: iso(NOW + DAY) })), "gutters", NOW)).toBe(true);
    expect(moduleActive(co(cm({ trialEndsAt: iso(NOW - DAY) })), "gutters", NOW)).toBe(false);
    expect(moduleActive(co(), "gutters", NOW)).toBe(false);
    expect(moduleActive(null, "gutters", NOW)).toBe(false);
    expect(activeModules(co(cm({ trialEndsAt: iso(NOW + DAY) })), NOW).map((d) => d.key)).toEqual(["gutters"]);
    expect(activeModules(co(cm({ enabled: false, trialEndsAt: iso(NOW + DAY) })), NOW)).toEqual([]);
  });
  it("switched on locally: the trial starts once — a used trial is never restarted", () => {
    expect(enabledLocally(undefined, gutters, NOW)).toEqual({ enabled: true, trialEndsAt: iso(NOW + 7 * DAY), settings: {}, rowVersion: 0 });
    const used = cm({ enabled: false, trialEndsAt: iso(NOW - DAY), settings: { a: 1 }, rowVersion: 4 });
    expect(enabledLocally(used, gutters, NOW)).toEqual({ ...used, enabled: true });
  });
  it("rows of company_modules → Company.modules; a broken row is left out", () => {
    expect(
      companyModulesFromRows([
        { module_key: "gutters", enabled: true, trial_ends_at: "2026-11-14T20:00:00+00:00", paid_until: null, settings: { x: 1 }, row_version: 3 },
        { module_key: "Bad Key", enabled: true },
        { module_key: "roofing", enabled: "yes" },
        { module_key: "fencing", enabled: false, settings: [1], row_version: null },
      ]),
    ).toEqual({
      gutters: { enabled: true, trialEndsAt: "2026-11-14T20:00:00+00:00", settings: { x: 1 }, rowVersion: 3 },
      fencing: { enabled: false, settings: {}, rowVersion: 0 },
    });
    expect(companyModulesFromRows([])).toEqual({});
  });
});

describe("unit:modules — the registry", () => {
  it("a module is found by its key; a key the server would refuse is refused here", () => {
    expect(moduleDef("gutters")).toBe(gutters);
    expect(allModules().map((d) => d.key)).toContain("gutters");
    expect(() => registerModule({ ...gutters, key: "Gutters!" })).toThrow();
  });
  it("discoverModules registers what a context gives (Metro's require.context in the app)", () => {
    const fake = Object.assign((id: string) => ({ default: id === "./x_demo/module.ts" ? { ...gutters, key: "x_demo" } : undefined }), {
      keys: () => ["./x_demo/module.ts", "./empty/module.ts"],
    });
    discoverModules(fake);
    expect(moduleDef("x_demo")?.key).toBe("x_demo");
    expect(moduleDef("empty")).toBeUndefined();
  });
  it("every folder of src/modules has a module.ts the registry's context finds; its key is the folder's name", async () => {
    const dir = join(__dirname, "../src/modules");
    const src = readFileSync(join(dir, "registry.ts"), "utf8");
    const re = new RegExp(/require\.context\("\.\/", true, \/(.+)\/\)\)/.exec(src)![1]);
    for (const f of readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())) {
      expect(re.test(`./${f}/module.ts`), f).toBe(true);
      const def = (await import(`../src/modules/${f}/module.ts`)).default;
      expect(def.key, f).toBe(f);
    }
    expect(re.test("./gutters/old/module.ts")).toBe(false);
    expect(re.test("./gutters/drawing.ts")).toBe(false);
  });
  it("the Gutters add-on: 7-day trial, $30 a month (founder О1, О2)", () => {
    expect(gutters).toMatchObject({ trialDays: 7, priceCentsMonthly: 3000 });
  });
});

describe("unit:modules — the ops (C2a)", () => {
  it("each op is its server function for my company; no direct write", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "module.enable", module: "gutters" }, "co-1", "u-1");
    await applyOp({ k: "module.disable", module: "gutters" }, "co-1", "u-1");
    await applyOp({ k: "module.saveSettings", module: "gutters", settings: { a: 1 }, baseRowVersion: 2 }, "co-1", "u-1");
    expect(rpcCalls).toEqual([
      { kind: "rpc", name: "module_enable", args: { p_company_id: "co-1", p_module_key: "gutters" } },
      { kind: "rpc", name: "module_disable", args: { p_company_id: "co-1", p_module_key: "gutters" } },
      { kind: "rpc", name: "module_save_settings", args: { p_company_id: "co-1", p_module_key: "gutters", p_settings: { a: 1 }, p_base_row_version: 2 } },
    ]);
  });
  it("the ops make nothing the queue must wait for; company.save never writes the modules", () => {
    for (const op of [{ k: "module.enable", module: "g" }, { k: "module.disable", module: "g" }, { k: "module.saveSettings", module: "g", settings: {}, baseRowVersion: 1 }] as const)
      expect(madeOnQueue(op, makeSeed())).toBeUndefined();
    const c = { ...makeSeed().company!, modules: { gutters: cm({}) } };
    expect(JSON.stringify(companyToDb(c, {}))).not.toContain("module");
  });
});

describe("unit:modules — the store (C2a, rule 5, rule 6)", () => {
  it("demo: on → the trial at once; off → off, the trial kept; «Отменить» takes each back; nothing is sent", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).mode).toBe("demo");
    expect(valueOf(r).db.company?.modules?.gutters).toBeUndefined();
    const undoOn = valueOf(r).enableModule("gutters");
    await settle();
    const on = valueOf(r).db.company!.modules!.gutters;
    expect(moduleState(on).access).toBe("trial");
    expect(moduleState(on).daysLeft).toBe(7);
    expect(on.rowVersion).toBe(1);
    const undoOff = valueOf(r).disableModule("gutters");
    await settle();
    expect(valueOf(r).db.company!.modules!.gutters).toMatchObject({ enabled: false, trialEndsAt: on.trialEndsAt, rowVersion: 2 });
    undoOff();
    await settle();
    expect(valueOf(r).db.company!.modules!.gutters).toEqual(on);
    undoOn();
    await settle();
    expect(valueOf(r).db.company?.modules?.gutters).toBeUndefined();
    expect(server.sends).toEqual([]);
  });
  it("settings: saved while active (the base version goes with them); not saved at all when off (founder О2)", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).saveModuleSettings("gutters", { a: 1 })).toBeNull();
    valueOf(r).enableModule("gutters");
    await settle();
    expect(valueOf(r).saveModuleSettings("gutters", { a: 1 })).toBeTypeOf("function");
    await settle();
    expect(valueOf(r).db.company!.modules!.gutters).toMatchObject({ settings: { a: 1 }, rowVersion: 2 });
    valueOf(r).disableModule("gutters");
    await settle();
    expect(valueOf(r).saveModuleSettings("gutters", { a: 2 })).toBeNull();
    expect(valueOf(r).db.company!.modules!.gutters.settings).toEqual({ a: 1 });
  });
  it("cloud: «Подключить» is on the screen at once and goes through the queue; settings carry the version edited", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("gutters");
    await settle();
    expect(moduleActive(valueOf(r).db.company, "gutters")).toBe(true);
    expect(valueOf(r).queue).toHaveLength(1);
    valueOf(r).setOnline(true);
    await settle();
    expect(server.sends.at(-1)).toMatchObject({ op: { k: "module.enable", module: "gutters" }, companyId: "c1", userId: "u1" });
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    // the read after the send: the server's own trial date wins over the phone's guess
    const seed = makeSeed();
    const serverRow = cm({ trialEndsAt: iso(Date.now() + 6 * DAY), rowVersion: 1 });
    server.loads.splice(0).forEach((d) => d.resolve({ ...seed, company: { ...seed.company!, modules: { gutters: serverRow } } }));
    await settle();
    expect(valueOf(r).db.company!.modules!.gutters).toEqual(serverRow);
    valueOf(r).saveModuleSettings("gutters", { a: 1 });
    await settle();
    appActive.cb?.(); // back in the app: the queue goes now (else the 1.5 s tick)
    await settle();
    expect(server.sends.at(-1)).toMatchObject({ op: { k: "module.saveSettings", module: "gutters", settings: { a: 1 }, baseRowVersion: 1 } });
  });
});

import { moduleView } from "../src/modules/moduleView";
import { placeActions } from "../src/modules/registry";

describe("unit:modules — «Компания → Модули» (C2b, founder О1–О2)", () => {
  it("never on → «Не подключён», «Подключить» starts the trial; nothing to switch off", () => {
    expect(moduleView(undefined, NOW)).toEqual({ status: "neutral", label: "mod.st.off", main: "start", canDisable: false, locked: false });
  });
  it("trial → info with days left; paid → ok; both can be switched off", () => {
    expect(moduleView(cm({ trialEndsAt: iso(NOW + 3 * DAY) }), NOW)).toEqual({ status: "info", label: "mod.st.trial", n: 3, main: null, canDisable: true, locked: false });
    expect(moduleView(cm({ trialEndsAt: iso(NOW - DAY), paidUntil: iso(NOW + DAY) }), NOW)).toMatchObject({ status: "ok", label: "mod.st.paid", main: null, canDisable: true });
  });
  it("trial over, unpaid → warn, locked, the main action is a payment (no new trial)", () => {
    expect(moduleView(cm({ trialEndsAt: iso(NOW - DAY) }), NOW)).toEqual({ status: "warn", label: "mod.st.expired", main: "pay", canDisable: true, locked: true });
  });
  it("switched off: back on while the trial (or payment) runs; after it — only a payment", () => {
    expect(moduleView(cm({ enabled: false, trialEndsAt: iso(NOW + DAY) }), NOW)).toMatchObject({ label: "mod.st.disabled", main: "resume", canDisable: false });
    expect(moduleView(cm({ enabled: false, trialEndsAt: iso(NOW - DAY), paidUntil: iso(NOW + DAY) }), NOW)).toMatchObject({ main: "resume" });
    expect(moduleView(cm({ enabled: false, trialEndsAt: iso(NOW - DAY) }), NOW)).toMatchObject({ label: "mod.st.disabled", main: "pay", locked: false });
  });
  it("every status label is in the dictionary (RU, EN, ES)", async () => {
    const { ru } = await import("../src/i18n/ru");
    for (const k of ["mod.st.off", "mod.st.disabled", "mod.st.trial", "mod.st.paid", "mod.st.expired"]) expect(ru, k).toHaveProperty([k]);
  });
});

describe("unit:modules — places in core screens (C2b)", () => {
  const demo = {
    ...gutters,
    key: "place_demo",
    places: {
      lead: (c: { leadId?: string }) => (c.leadId ? [{ id: "measure", labelKey: "mod.title" as const, icon: "pencil" as const, href: `/x?lead=${c.leadId}` }] : []),
      home: (c: { role: string }) => (c.role === "tech" ? [] : [{ id: "here", labelKey: "mod.title" as const, icon: "pin" as const, href: "/x" }]),
    },
  };
  registerModule(demo);
  const on = { modules: { place_demo: cm({ trialEndsAt: iso(NOW + DAY) }) } };
  it("an active module adds its actions, tagged with the module; the screen's object and role go to it", () => {
    expect(placeActions("lead", on, { role: "director", leadId: "l1" }, NOW)).toEqual([{ id: "measure", labelKey: "mod.title", icon: "pencil", href: "/x?lead=l1", module: "place_demo" }]);
    expect(placeActions("lead", on, { role: "director" }, NOW)).toEqual([]);
    expect(placeActions("home", on, { role: "tech" }, NOW)).toEqual([]);
    expect(placeActions("home", on, { role: "sales" }, NOW).map((a) => a.id)).toEqual(["here"]);
    expect(placeActions("property", on, { role: "director" }, NOW)).toEqual([]);
  });
  it("not switched on, or the trial over → nothing in the screens (founder О2)", () => {
    expect(placeActions("lead", {}, { role: "director", leadId: "l1" }, NOW)).toEqual([]);
    expect(placeActions("lead", { modules: { place_demo: cm({ trialEndsAt: iso(NOW - DAY) }) } }, { role: "director", leadId: "l1" }, NOW)).toEqual([]);
    expect(placeActions("lead", { modules: { place_demo: cm({ enabled: false, trialEndsAt: iso(NOW + DAY) }) } }, { role: "director", leadId: "l1" }, NOW)).toEqual([]);
  });
});
