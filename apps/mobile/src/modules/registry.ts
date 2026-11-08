/**
 * Add-on modules of a trade (docs/specs/33-gutters-module.md §10, П2.1 K6, П15). The core knows modules only through
 * this file, and this file knows no trade: a module describes itself in `src/modules/<key>/module.ts` (default export
 * `ModuleDef`) and is found here by Metro's `require.context`. Tests (vitest has no require.context) call
 * `registerModule`.
 *
 * Access mirrors the server's app.module_active (migration company_modules, C1): switched on and in the trial or paid.
 * After the trial without payment nothing of the module is saved (founder О2, 07.11.2026): drafts open read-only.
 */
import type { Company } from "@/data/types";
import type { DictKey } from "@/i18n";

/** where a module may add its own actions in the core screens (estimate and job — with their first content, П15.3) */
export type ModulePlace = "lead" | "property" | "home" | "estimate" | "job" | "settings";

/** a row of public.company_modules as the phone keeps it (Company.modules[key]) */
export interface CompanyModule {
  enabled: boolean;
  /** set once by the server on the first switch-on; switching off and on never restarts it */
  trialEndsAt?: string;
  /** set by billing only (step «Оплаты»); absent = not paid */
  paidUntil?: string;
  settings: Record<string, unknown>;
  /** the version the phone last read: module.saveSettings sends it, a newer one on the server is a conflict */
  rowVersion: number;
}

/** what a core screen gives a module's place: the screen's own object and who looks */
export interface PlaceCtx {
  role: import("@/data/types").Role;
  leadId?: string;
  customerId?: string;
  propertyId?: string;
}
/** one action of a module in a core screen: a button (lead, property) or an item of «＋» (home) */
export interface ModuleAction {
  /** unique within the module; testID `module-<key>-<id>` */
  id: string;
  labelKey: DictKey;
  icon: import("@/ui/primitives").IconKey;
  href: string;
}

/** a module's change as the queue carries it (Op "module.op"): what to do and with what */
export interface ModuleOpIn {
  kind: string;
  payload: Record<string, unknown>;
}
/** sends one module.op to the server; `run` turns a supabase result into the queue's errors (cloud/ops.ts) */
export type ModuleOpHandler = (
  op: ModuleOpIn,
  ctx: { companyId: string; userId: string; run: (p: PromiseLike<{ error: { message: string; code?: string; hint?: string } | null; status?: number }>) => Promise<void> },
) => Promise<void>;

export interface ModuleDef {
  /** = company_modules.module_key: ^[a-z][a-z0-9_]{1,30}$ */
  key: string;
  titleKey: DictKey;
  hintKey: DictKey;
  trialDays: number;
  /** the add-on's price a month (founder О1); payment itself is the step «Оплаты» */
  priceCentsMonthly: number;
  /** the module's actions by place; a place with nothing for this screen / role returns [] */
  places?: Partial<Record<ModulePlace, (ctx: PlaceCtx) => ModuleAction[]>>;
  /** sends the module's own changes (module.op); a module without it has no changes of its own yet */
  ops?: ModuleOpHandler;
  /**
   * the module's own screens, opened at /module/<key>/<screen> (src/app/module/[key]/[screen].tsx). Loaded on first
   * open (a function, so the registry and vitest never load screen code). Spec 33 П20.3.
   */
  screens?: Record<string, () => import("react").ComponentType>;
}

/** off — not switched on; trial — in the trial; paid — paid; expired — switched on, trial over, not paid */
export type ModuleAccess = "off" | "trial" | "paid" | "expired";
export interface ModuleState {
  access: ModuleAccess;
  /** whole days of the trial left (trial only; the last day counts as 1) */
  daysLeft?: number;
  /** the trial was started once: «Подключить» is then a payment, not a new trial */
  trialUsed: boolean;
}

const DAY = 86_400_000;
const at = (iso?: string) => (iso ? Date.parse(iso) : NaN);

export function moduleState(cm: CompanyModule | undefined, now = Date.now()): ModuleState {
  const trialEnds = at(cm?.trialEndsAt);
  const trialUsed = Number.isFinite(trialEnds);
  if (!cm?.enabled) return { access: "off", trialUsed };
  if (at(cm.paidUntil) > now) return { access: "paid", trialUsed };
  if (trialEnds > now) return { access: "trial", daysLeft: Math.max(1, Math.ceil((trialEnds - now) / DAY)), trialUsed };
  return { access: "expired", trialUsed };
}

/** usable now: the module's places show and its data is saved (= app.module_active on the server) */
export const moduleActive = (company: Pick<Company, "modules"> | null | undefined, key: string, now = Date.now()): boolean => {
  const a = moduleState(company?.modules?.[key], now).access;
  return a === "trial" || a === "paid";
};

/** what the phone shows right after «Подключить», before the server answers (the server's date wins on the next read) */
export function enabledLocally(cm: CompanyModule | undefined, def: Pick<ModuleDef, "trialDays"> | undefined, now = Date.now()): CompanyModule {
  const trialEndsAt = cm?.trialEndsAt ?? new Date(now + (def?.trialDays ?? 7) * DAY).toISOString();
  return { settings: {}, rowVersion: 0, ...cm, enabled: true, trialEndsAt };
}

/** rows of public.company_modules → Company.modules; a broken row is left out */
export function companyModulesFromRows(rows: readonly Record<string, unknown>[]): Record<string, CompanyModule> {
  const out: Record<string, CompanyModule> = {};
  for (const r of rows) {
    const key = r.module_key;
    if (typeof key !== "string" || !/^[a-z][a-z0-9_]{1,30}$/.test(key) || typeof r.enabled !== "boolean") continue;
    const settings = r.settings && typeof r.settings === "object" && !Array.isArray(r.settings) ? (r.settings as Record<string, unknown>) : {};
    out[key] = {
      enabled: r.enabled,
      ...(typeof r.trial_ends_at === "string" ? { trialEndsAt: r.trial_ends_at } : {}),
      ...(typeof r.paid_until === "string" ? { paidUntil: r.paid_until } : {}),
      settings,
      rowVersion: typeof r.row_version === "number" ? r.row_version : 0,
    };
  }
  return out;
}

/* ---------- the list of modules ---------- */
const defs = new Map<string, ModuleDef>();

export function registerModule(def: ModuleDef): void {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(def.key)) throw new Error(`module key ${def.key}: ^[a-z][a-z0-9_]{1,30}$`);
  defs.set(def.key, def);
}
export const moduleDef = (key: string): ModuleDef | undefined => defs.get(key);
/** every module the app has, in a stable order (by key) */
export const allModules = (): ModuleDef[] => [...defs.values()].sort((a, b) => a.key.localeCompare(b.key));
/** the company's usable modules */
export const activeModules = (company: Pick<Company, "modules"> | null | undefined, now = Date.now()): ModuleDef[] =>
  allModules().filter((d) => moduleActive(company, d.key, now));

/** the actions the company's usable modules add to a place (a module not active adds nothing — founder О2) */
export function placeActions(place: ModulePlace, company: Pick<Company, "modules"> | null | undefined, ctx: PlaceCtx, now = Date.now()): (ModuleAction & { module: string })[] {
  return activeModules(company, now).flatMap((d) => (d.places?.[place]?.(ctx) ?? []).map((a) => ({ ...a, module: d.key })));
}

/** a module's screen by its address parts; unknown module or screen → undefined */
export const moduleScreen = (key: string | undefined, screen: string | undefined): (() => import("react").ComponentType) | undefined =>
  key && screen ? defs.get(key)?.screens?.[screen] : undefined;
export const moduleHref = (key: string, screen: string) => `/module/${key}/${screen}`;

type Ctx = { keys(): string[]; (id: string): { default?: ModuleDef } };
/** registers every `<key>/module.ts` a context gives (Metro: require.context below; tests: a stand-in) */
export function discoverModules(ctx: Ctx): void {
  for (const k of ctx.keys()) {
    const def = ctx(k).default;
    if (def) registerModule(def);
  }
}
declare global {
  // Metro's require.context (expo/metro-config: unstable_allowRequireContext)
  interface NodeRequire {
    context?: (dir: string, deep: boolean, filter: RegExp) => Ctx;
  }
}
// Metro (app, web) — every src/modules/<key>/module.ts. Not in vitest: there `require` is absent or has no `context`.
if (typeof require === "function" && typeof require.context === "function") discoverModules(require.context("./", true, /^\.\/[a-z][a-z0-9_]*\/module\.ts$/));
