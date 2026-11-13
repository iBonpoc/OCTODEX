/**
 * The Gutters module as the core sees it (docs/specs/33-gutters-module.md П15): found by src/modules/registry.ts.
 * Add-on $30 a month a company, 7-day trial (founder О1, О2, 07.11.2026). Places (spec 33 П21 M5b, П24): «Замер желобов» on a lead, an address, a client, a visit and in the home «＋».
 * Screens (spec 33-gutters-canvas П20.3–П20.4): /module/gutters/draw — the measuring canvas (M4b: one draft on the phone;
 * the entry from a lead and a property is M5), /module/gutters/bench — the canvas speed check, /module/gutters/settings —
 * the company's settings (M7b, spec 33 П22), /module/gutters/prices — labor prices and the price list's items (M7d, П22.10).
 */
import { moduleHref, type ModuleDef } from "../registry";
import { asGutterData, guttersOps, linkLead, loadGutters, measureHref, rebuildOp } from "./data";
import { engineStaleMeasurements, staleMeasurements } from "./estimateLink";

const draw = moduleHref("gutters", "draw");
/** «Просмотр замера» (#698): the drawing whole, its list, the estimate by the state; estimate=1 does the estimate at once */
const view = moduleHref("gutters", "view");
/** «Замер желобов» on a lead, an address or a visit: its newest measurement's card opens, else a new one linked to it on the canvas (S4g, П24, П25.3 В) */
function measure(data: unknown, by: { leadId?: string; propertyId?: string; leadIds?: readonly string[] }) {
  const g = asGutterData(data);
  const { href, open: m } = measureHref({ draw, view }, g, by);
  if (m) {
    const open = { id: "measure", labelKey: "mod.gutters.measureOpen" as const, icon: "pencil" as const, href };
    // M8b (S5g): something is drawn → «Смета из замера»: the measurement's review opens and makes or updates it (П23.8, П20.25)
    const drawn = g.elements.some((e) => e.measurementId === m.id && e.kind === "run");
    return drawn ? [open, { id: "estimate", labelKey: "mod.gutters.est.fromLead" as const, icon: "plus" as const, href: `${view}?m=${encodeURIComponent(m.id)}&estimate=1` }] : [open];
  }
  return [{ id: "measure", labelKey: "mod.gutters.measure" as const, icon: "pencil" as const, href }];
}

const gutters: ModuleDef = {
  key: "gutters",
  titleKey: "mod.gutters.title",
  hintKey: "mod.gutters.hint",
  trialDays: 7,
  priceCentsMonthly: 3000,
  places: {
    // everyone who measures (П11): owner, admin, office, sales, tech; a subcontractor has no measuring role here
    lead: (ctx, data) => (ctx.leadId ? measure(data, { leadId: ctx.leadId, ...(ctx.propertyId ? { propertyId: ctx.propertyId } : {}) }) : []),
    property: (ctx, data) => (ctx.propertyId ? measure(data, { propertyId: ctx.propertyId, leadIds: ctx.leadIds }) : []),
    // П24 А3 (#697): the client's card — one button; the start screen goes to the address (one), a pick (several) or says
    // to add an address (none)
    client: (ctx) => (ctx.customerId ? [{ id: "measure", labelKey: "mod.gutters.measure" as const, icon: "pencil" as const, href: `${moduleHref("gutters", "start")}?customer=${encodeURIComponent(ctx.customerId)}` }] : []),
    // П24 А7: a visit — the measurement of its lead, else of its address
    visit: (ctx, data) => (ctx.leadId || ctx.propertyId ? measure(data, ctx.leadId ? { leadId: ctx.leadId, ...(ctx.propertyId ? { propertyId: ctx.propertyId } : {}) } : { propertyId: ctx.propertyId, leadIds: ctx.leadIds }) : []),
    // «Замерить здесь»: a draft without a lead (S1b → «Сделать заявкой»); the address by location — stage 3 (П21.2 №8)
    home: () => [
      { id: "here", labelKey: "mod.gutters.measureHere", icon: "pencil", href: draw },
      // «Замеры» (founder 09.11): every measurement, the drafts without a client too — found again after leaving
      { id: "list", labelKey: "mod.gutters.list.action", icon: "note", href: moduleHref("gutters", "list") },
    ],
    // «Замеры» in the bottom tabs and the side menu (founder 09.11: «делай»): every measurement, the drafts too
    tab: () => [{ id: "list", labelKey: "mod.gutters.list.tab", icon: "note", href: moduleHref("gutters", "list") }],
    // the module's own card in «Компания → Модули»: the speed check saves nothing, so it is there even when off
    // the canvas draws even when off: it says at once that nothing will be saved (§6, founder О2)
    // «Настройки» (M7b, spec 33 П22): the director changes them, the office reads them; a tech or a seller never needs the page
    settings: (ctx) => [
      ...(ctx.role === "director" || ctx.role === "dispatcher" ? [{ id: "settings", labelKey: "mod.gutters.set.action" as const, icon: "sliders" as const, href: moduleHref("gutters", "settings") }] : []),
      // «Цены и прайс» (M7d, spec 33 П22.10): who writes the price list (all but a tech — app.is_staff, the core's /catalog)
      ...(ctx.role !== "tech" ? [{ id: "prices", labelKey: "mod.gutters.pr.action" as const, icon: "box" as const, href: moduleHref("gutters", "prices") }] : []),
      { id: "list", labelKey: "mod.gutters.list.action", icon: "note", href: moduleHref("gutters", "list") },
      { id: "draw", labelKey: "mod.gutters.draw.action", icon: "pencil", href: draw },
      { id: "bench", labelKey: "mod.gutters.bench.action", icon: "clock", href: moduleHref("gutters", "bench") },
    ],
  },
  // the measurement's tables (spec 33 П19) and its changes (П21): DB.moduleData.gutters
  load: loadGutters,
  ops: guttersOps,
  // starter checklist templates (docs/specs/08 §2, §11.11; CH3b): the office adds them on «Компания → Чек-листы»; once added, «Перед монтажом» and «Сдача
  // работы» come into every «работа» visit by themselves (#607); «Чистка» not (a cleaning is not part of every job: it would
  // bring its required items into every installation) — the office ties it to a service of its catalog; the office may change any
  checklistTemplates: [
    {
      key: "pre",
      visitKinds: ["work"],
      nameKey: "mod.gutters.chk.pre",
      items: [
      { id: "69385b0b-9477-4163-a2ae-2f60f172261c", labelKey: "mod.gutters.chk.pre1", kind: "check", required: true },
      { id: "044f6e47-893c-4da4-ab3f-24df06b66640", labelKey: "mod.gutters.chk.pre2", kind: "check", required: true },
      { id: "9c36ce75-22e7-4261-a1e7-2bd1ad2bf0da", labelKey: "mod.gutters.chk.pre3", kind: "photo", required: true },
      { id: "0e0ddee8-7de7-44b1-b80e-6bc207adf996", labelKey: "mod.gutters.chk.pre4", kind: "check", required: false },
      ],
    },
    {
      key: "handover",
      visitKinds: ["work"],
      nameKey: "mod.gutters.chk.handover",
      items: [
      { id: "4c70b085-e445-47ac-80e9-949a63c7b31e", labelKey: "mod.gutters.chk.handover1", kind: "check", required: true },
      { id: "5226a5d5-3184-4342-a28f-9fff88794b9f", labelKey: "mod.gutters.chk.handover2", kind: "check", required: true },
      { id: "8254c7e9-ed22-41ca-bdbc-76fc1358e88c", labelKey: "mod.gutters.chk.handover3", kind: "photo", required: true },
      { id: "7f180cd2-4f3f-461c-b74d-0626aac14226", labelKey: "mod.gutters.chk.handover4", kind: "check", required: true },
      ],
    },
    {
      key: "clean",
      nameKey: "mod.gutters.chk.clean",
      items: [
      { id: "e2f4a9da-2e73-4b6a-b347-bb618ee52a96", labelKey: "mod.gutters.chk.clean1", kind: "photo", required: true },
      { id: "2ddca2c3-981f-4c9e-ba28-3b7bd9c37c0a", labelKey: "mod.gutters.chk.clean2", kind: "check", required: true },
      { id: "0d51f8ee-5dc9-4240-84ea-fb1129f12c7b", labelKey: "mod.gutters.chk.clean3", kind: "photo", required: true },
      ],
    },
  ],
  // starter ESTIMATE templates (docs/specs/07 §12, #1323): «загрузил и меняю количество» — the office adds them on «Сметы → Шаблоны»; every line names
  // the company's price-list item by its properties and unit (the same as a drawing's estimate line), the price is the item's today
  // (a test one is marked «тестовая цена» in the list, rule 9); a line without an item is $0 with «проверьте цену». The quantities
  // are only a start. They never touch a measurement's lines — the main way is «Смета из замера»
  estimateTemplates: [
    {
      key: "clean",
      nameKey: "mod.gutters.est.tpl.clean",
      options: [{ key: "main", nameKey: "mod.gutters.est.tpl.clean.opt", recommended: true, lines: [
        { key: "clean", nameKey: "mod.gutters.est.tpl.clean.l1", group: "labor", quantity: "100", unit: "ft", match: { work: "cleaning" } },
        { key: "flush", nameKey: "mod.gutters.est.tpl.clean.l2", group: "labor", quantity: "4", unit: "ea", match: { work: "flush" } },
      ] }],
    },
    {
      key: "guards",
      nameKey: "mod.gutters.est.tpl.guards",
      options: [{ key: "main", nameKey: "mod.gutters.est.tpl.guards.opt", recommended: true, lines: [
        { key: "guard", nameKey: "mod.gutters.est.tpl.guards.l1", group: "material", quantity: "100", unit: "ft", match: { part: "guard_run" } },
        { key: "install", nameKey: "mod.gutters.est.tpl.guards.l2", group: "labor", quantity: "100", unit: "ft", match: { work: "guard_install" } },
      ] }],
    },
    {
      key: "replace",
      nameKey: "mod.gutters.est.tpl.replace",
      options: [{ key: "main", nameKey: "mod.gutters.est.tpl.replace.opt", recommended: true, lines: [
        { key: "tearoff", nameKey: "mod.gutters.est.tpl.replace.l1", group: "labor", quantity: "100", unit: "ft", match: { work: "tearoff" } },
        { key: "gutter", nameKey: "mod.gutters.est.tpl.replace.l2", group: "material", quantity: "100", unit: "ft", match: { part: "gutter" } },
        { key: "caps", nameKey: "mod.gutters.est.tpl.replace.l3", group: "material", quantity: "4", unit: "ea", match: { part: "end_cap" } },
        { key: "ds", nameKey: "mod.gutters.est.tpl.replace.l4", group: "material", quantity: "20", unit: "ft", match: { part: "downspout" } },
        { key: "install", nameKey: "mod.gutters.est.tpl.replace.l5", group: "labor", quantity: "100", unit: "ft", match: { work: "install", story: "1" } },
        { key: "dsinstall", nameKey: "mod.gutters.est.tpl.replace.l6", group: "labor", quantity: "2", unit: "ea", match: { work: "downspout", story: "1" } },
      ] }],
    },
  ],
  rejectedKey: "mod.gutters.rejected",
  // C5b (spec 33 П23.11): the drawing changed after the estimate → «Обновить из замера» (the review's «Перенести изменения в смету»)
  estimateNotes: (e, db) => {
    const m = staleMeasurements(db, e)[0];
    // the drawing's change says it first: not two buttons that do the same
    const eng = engineStaleMeasurements(db, e).find((x) => x.id !== m?.id);
    const notes = [];
    if (m) notes.push({ id: "stale", labelKey: "mod.gutters.est.stale" as const, hintKey: "mod.gutters.est.staleHint" as const, action: { id: "stale-update", labelKey: "mod.gutters.est.staleUpdate" as const, icon: "pencil" as const, href: `${view}?m=${encodeURIComponent(m.id)}&estimate=1` } });
    // #1165: the engine's rule changed since the estimate was computed → «Обновить» (a signed estimate is not offered notes at all)
    if (eng) notes.push({ id: "engine", labelKey: "mod.gutters.est.engine" as const, hintKey: "mod.gutters.est.engineHint" as const, action: { id: "engine-update", labelKey: "mod.gutters.est.staleUpdate" as const, icon: "pencil" as const, href: `${view}?m=${encodeURIComponent(eng.id)}&estimate=1` } });
    return notes;
  },
  leadCreated: ({ ref, leadId }, store) => linkLead(store, ref, leadId),
  rebuild: rebuildOp,
  screens: {
    draw: () => require("./draw/DrawScreen").default,
    view: () => require("./view/ViewScreen").default,
    list: () => require("./list/MeasurementsScreen").default,
    start: () => require("./list/StartScreen").default,
    bench: () => require("./bench/BenchScreen").default,
    settings: () => require("./settings/SettingsScreen").default,
    prices: () => require("./prices/PricesScreen").default,
  },
};
export default gutters;
