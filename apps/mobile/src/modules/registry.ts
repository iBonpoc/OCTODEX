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
/** `tab` (founder 09.11): a section of the module in the bottom tabs (phone, before «Ещё») and in the side menu (820/1280) —
 *  only while the module is usable; the core's own 5 tabs stay as they are. `client` and `visit` (09.11, spec 33 П24 А3,
 *  А7): the client's card and a visit's screen — the module decides what its buttons do there */
export type ModulePlace = "lead" | "property" | "client" | "visit" | "home" | "estimate" | "job" | "settings" | "tab";

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
  /** a visit's screen: the visit (its lead, client and property come in the fields above) */
  visitId?: string;
  /** the leads of this address or client (a lead that got the address: what was made on the lead shows here too —
   *  spec 33 П24 Б4, S4h) */
  leadIds?: string[];
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

/** what a module's hook gets of the store (store.tsx): the data and the module's own change */
export interface ModuleStore {
  db: import("@/data/types").DB;
  moduleOp: (module: string, change: { kind: string; payload: Record<string, unknown>; apply: (d: import("@/data/types").DB) => import("@/data/types").DB; coalesceKey?: string; made?: string[] }) => unknown;
  /** the store's «Отменить» of several actions: all or none (store.tsx). Missing in an older test store — then one by one */
  undoTogether?: (undos: readonly (import("@/data/undo").GuardedUndo | null | undefined)[]) => import("@/data/undo").GuardedUndo;
}

/**
 * What a module that writes estimate lines gets of the store (spec 33 П23.8, M8b): the core's own two functions —
 * a lead's client and property for its estimate (created from the lead when it has none, S3) and the estimate's save
 * (money through the engine, the offline queue, «Отменить»). A module never writes an estimate any other way.
 */
export interface ModuleEstimateStore extends ModuleStore {
  leadEstimateTarget: (leadId: string) => { customerId: string; propertyId: string; undo: import("@/data/undo").GuardedUndo } | null;
  /** a new estimate at this property is the person's to make (a tech: where he works — the server's estimates_insert);
   *  asked before anything is written for it (#1138). Missing in an older test store — then «yes». */
  mayMakeEstimateAt?: (propertyId: string | undefined) => boolean;
  saveEstimate: (e: { id: string; customerId: string; propertyId: string; title: string; doc: import("@/data/types").EstimateDoc; leadId?: string }) => import("@/data/undo").GuardedUndo;
}

/**
 * a module's word on an estimate (spec 33 П23.11, C5b): something the core cannot know — e.g. «the measurement changed
 * after this estimate». The core shows it on the estimate (warn: icon + word) and asks to confirm before the estimate
 * reaches the client (send, on-site signing, PDF) — never a hard stop. `action` — the module's way out.
 */
export interface ModuleNote {
  /** unique within the module; testID `module-<key>-<id>` */
  id: string;
  labelKey: DictKey;
  hintKey: DictKey;
  action?: ModuleAction;
}

/** what a module's load gets: the company's live rows of one of its own tables (deleted_at is null), page by page */
export interface ModuleRead {
  live(table: string, cols: string): Promise<Record<string, unknown>[]>;
}

/**
 * A starter checklist template of a module (docs/specs/08 §2, §11.7 №12, §11.11; step 14 CH3b). The office adds it on
 * «Компания → Чек-листы» (the text in the app's language at that moment; then it is the company's own and is edited
 * there). Item ids are the module's fixed uuids: they tell that a company has the starter already (an archived one too)
 * and keep a visit's snapshot free of doubles. The template's own id is the company's (a new one).
 */
export interface StarterChecklist {
  /** unique within the module; testID `chk-starter-<module>-<key>` */
  key: string;
  nameKey: DictKey;
  items: { id: string; labelKey: DictKey; kind: "check" | "photo"; required: boolean; hintKey?: DictKey }[];
  everyVisit?: boolean;
  visitKinds?: ("inspection" | "work")[];
  /** 1..20: raise the company's minimum of photos (never lower) */
  minPhotosBefore?: number;
  minPhotosAfter?: number;
}

/**
 * A starter estimate template of a module (docs/specs/07 §12, E3c). The office adds it on «Шаблоны смет»: the template's
 * name in the app's language (only the team sees it), options, lines and note in the company's DOCUMENT language (they
 * reach the client, rule 7). No prices here (rule 9): a line names its catalog item by the item's properties (`match`,
 * as catalogMatch) and unit; found — the item's link and today's price, not found — price 0 and «проверьте цену».
 * Tax and deposit come from the company's settings; no discount. Then it is the company's own template.
 */
export interface StarterEstimate {
  /** unique within the module; testID `est-starter-<module>-<key>` */
  key: string;
  nameKey: DictKey;
  noteKey?: DictKey;
  /** 1..10 */
  options: {
    key: string;
    nameKey: DictKey;
    recommended?: boolean;
    /** 0..200; a line's key is unique within the template */
    lines: {
      key: string;
      nameKey: DictKey;
      group: "service" | "labor" | "material";
      /** the engine's decimal, e.g. "1", "2.5" */
      quantity: string;
      /** ≤ 20 characters; the catalog item must have the same unit */
      unit: string;
      /** the catalog item's properties (catalog_items.attributes) */
      match?: Record<string, string>;
      optional?: boolean;
    }[];
  }[];
}

export interface ModuleDef {
  /** = company_modules.module_key: ^[a-z][a-z0-9_]{1,30}$ */
  key: string;
  /** #1265: a waiting op of this module written again from the phone's data `d` (an earlier change folded into it by
   *  coalesceKey was taken back): its payload now, or null — cannot (then that «Отменить» is too late) */
  rebuild?: (op: { kind: string; payload: Record<string, unknown> }, d: import("@/data/types").DB) => Record<string, unknown> | null;
  titleKey: DictKey;
  hintKey: DictKey;
  trialDays: number;
  /** the add-on's price a month (founder О1); payment itself is the step «Оплаты» */
  priceCentsMonthly: number;
  /** the module's actions by place; a place with nothing for this screen / role returns []. `data` — the module's own
   *  DB.moduleData[key] (e.g. «Открыть замер» when the lead has one) */
  places?: Partial<Record<ModulePlace, (ctx: PlaceCtx, data: unknown) => ModuleAction[]>>;
  /** sends the module's own changes (module.op); a module without it has no changes of its own yet */
  ops?: ModuleOpHandler;
  /**
   * the module's own screens, opened at /module/<key>/<screen> (src/app/module/[key]/[screen].tsx). Loaded on first
   * open (a function, so the registry and vitest never load screen code). Spec 33 П20.3.
   */
  screens?: Record<string, () => import("react").ComponentType>;
  /**
   * reads the module's own tables into DB.moduleData[key] (spec 33 П21.2 №4). Called when the company has the module's
   * row (switched on once — after the trial drafts still open, founder О2). A failed read keeps what the phone had.
   */
  load?: (read: ModuleRead) => Promise<unknown>;
  /**
   * a lead was made from a module's thing (S1b «Сделать заявкой»: /lead/new?module=<key>&ref=<id>): the module links its
   * thing to the lead through the store it is given (moduleOp). The lead form is the core's, unchanged (spec 14).
   */
  leadCreated?: (x: { ref: string; leadId: string }, store: ModuleStore) => import("@/data/undo").GuardedUndo | null | undefined;
  /** its words on an open (draft / sent) estimate; `data` — DB.moduleData[key]. Pure: called on every render */
  estimateNotes?: (e: import("@/data/types").Estimate, db: import("@/data/types").DB, data: unknown) => ModuleNote[];
  /**
   * S11g (docs/specs/37 §3): what this trade adds to a job's supplier order — parts bought but not on the client's
   * estimate, its own quantities. A line for an item the core also has REPLACES the core's; `packed` — already in packs.
   * Pure; `data` — DB.moduleData[key]. The core makes the order; the module never knows the supplier.
   */
  purchaseLines?: (job: import("@/data/types").Job, db: import("@/data/types").DB, data: unknown) => import("@/features/purchaseOrders").ModulePurchaseLine[];
  /** starter checklist templates the office may add (optional; a module without them adds none) */
  checklistTemplates?: StarterChecklist[];
  /** starter estimate templates the office may add (optional; docs/specs/07 §12) */
  estimateTemplates?: StarterEstimate[];
  /** the text of «not saved: the trial is over» (a refused batch of this module's changes, spec 33 П21.1); params {count} */
  rejectedKey?: DictKey;
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
  // starter items: lowercase uuids (the server's app.valid_checklist_items), unique across the module's starters
  const ids = (def.checklistTemplates ?? []).flatMap((t) => t.items.map((i) => i.id));
  const bad = ids.find((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id));
  if (bad !== undefined || new Set(ids).size !== ids.length) throw new Error(`module ${def.key}: starter item ids — unique lowercase uuids`);
  const starters = def.checklistTemplates ?? [];
  if (starters.some((t) => t.items.length < 1 || t.items.length > 100) || new Set(starters.map((t) => t.key)).size !== starters.length)
    throw new Error(`module ${def.key}: a starter has 1..100 items and its own key`);
  const est = def.estimateTemplates ?? [];
  const qty = /^([0-9]{1,12}([.][0-9]{1,12})?|[.][0-9]{1,12})$/;
  if (
    new Set(est.map((t) => t.key)).size !== est.length ||
    est.some((t) => {
      const lines = t.options.flatMap((o) => o.lines);
      return (
        t.options.length < 1 || t.options.length > 10 || t.options.some((o) => o.lines.length > 200) ||
        new Set(t.options.map((o) => o.key)).size !== t.options.length || new Set(lines.map((l) => l.key)).size !== lines.length ||
        lines.some((l) => !qty.test(l.quantity) || !l.unit || Array.from(l.unit).length > 20)
      );
    })
  )
    throw new Error(`module ${def.key}: a starter estimate has its own key, 1..10 options, ≤ 200 lines, own line keys, a decimal quantity, a unit ≤ 20`);
  defs.set(def.key, def);
}
export const moduleDef = (key: string): ModuleDef | undefined => defs.get(key);
/** every module the app has, in a stable order (by key) */
export const allModules = (): ModuleDef[] => [...defs.values()].sort((a, b) => a.key.localeCompare(b.key));
/** the company's usable modules */
export const activeModules = (company: Pick<Company, "modules"> | null | undefined, now = Date.now()): ModuleDef[] =>
  allModules().filter((d) => moduleActive(company, d.key, now));

/** the actions the company's usable modules add to a place (a module not active adds nothing — founder О2) */
export function placeActions(place: ModulePlace, company: Pick<Company, "modules"> | null | undefined, ctx: PlaceCtx, now = Date.now(), moduleData?: Record<string, unknown>): (ModuleAction & { module: string })[] {
  return activeModules(company, now).flatMap((d) => (d.places?.[place]?.(ctx, moduleData?.[d.key]) ?? []).map((a) => ({ ...a, module: d.key })));
}

/** the usable modules' sections in the tabs and the side menu (place «tab»): id `module-<key>-<id>` */
export function moduleTabs(company: Pick<Company, "modules"> | null | undefined, role: import("@/data/types").Role, now = Date.now()) {
  return placeActions("tab", company, { role }, now).map((a) => ({ ...a, tabId: `module-${a.module}-${a.id}` }));
}

/** the usable modules' words on an estimate; only an open one (draft / sent) — a signed one is a copy, more is a change order */
export function estimateNotes(db: import("@/data/types").DB, e: import("@/data/types").Estimate, now = Date.now()): (ModuleNote & { module: string })[] {
  if (e.status !== "draft" && e.status !== "sent") return [];
  return activeModules(db.company, now).flatMap((d) => (d.estimateNotes?.(e, db, db.moduleData?.[d.key]) ?? []).map((n) => ({ ...n, module: d.key })));
}

/** S11g: the lines every active module adds to a job's supplier order (a module that fails adds none) */
export function modulePurchaseLines(db: import("@/data/types").DB, jobId: string, now = Date.now()): import("@/features/purchaseOrders").ModulePurchaseLine[] {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return [];
  return activeModules(db.company, now).flatMap((d) => {
    try {
      return d.purchaseLines?.(job, db, db.moduleData?.[d.key]) ?? [];
    } catch {
      return [];
    }
  });
}

/**
 * every loading module's data the company has (spec 33 П21): modules with a load and a row in company_modules. A read
 * that fails leaves its key out — keepModuleData then keeps the phone's copy.
 */
export async function loadModuleData(modules: Record<string, CompanyModule>, read: ModuleRead): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  await Promise.all(
    allModules()
      .filter((d) => d.load && modules[d.key])
      .map(async (d) => {
        try {
          out[d.key] = await d.load!(read);
        } catch {
          /* kept from the phone (keepModuleData) */
        }
      }),
  );
  return out;
}
/** a fresh read without a module's data (its read failed) keeps the phone's copy of it */
export function keepModuleData<T extends { moduleData?: Record<string, unknown>; company?: Pick<Company, "modules"> | null }>(next: T, prev: { moduleData?: Record<string, unknown> } | null | undefined): T {
  const had = prev?.moduleData ?? {};
  const keep = Object.keys(had).filter((k) => !(k in (next.moduleData ?? {})) && next.company?.modules?.[k] && moduleDef(k)?.load);
  if (!keep.length) return next;
  return { ...next, moduleData: { ...next.moduleData, ...Object.fromEntries(keep.map((k) => [k, had[k]])) } };
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
