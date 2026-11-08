/**
 * The Gutters module as the core sees it (docs/specs/33-gutters-module.md П15): found by src/modules/registry.ts.
 * Add-on $30 a month a company, 7-day trial (founder О1, О2, 07.11.2026). Places (spec 33 П21 M5b): «Замер» on a lead and a property, «Замерить здесь» in the home «＋».
 * Screens (spec 33-gutters-canvas П20.3–П20.4): /module/gutters/draw — the measuring canvas (M4b: one draft on the phone;
 * the entry from a lead and a property is M5), /module/gutters/bench — the canvas speed check, /module/gutters/settings —
 * the company's settings (M7b, spec 33 П22), /module/gutters/prices — labor prices and the price list's items (M7d, П22.10).
 */
import { moduleHref, type ModuleDef } from "../registry";
import { asGutterData, guttersOps, latestFor, linkLead, loadGutters } from "./data";

const draw = moduleHref("gutters", "draw");
/** «Замер» on a lead or a property: its newest measurement opens, else a new one linked to it (S4g, spec 33 П21) */
function measure(data: unknown, by: { leadId?: string; propertyId?: string }) {
  const m = latestFor(asGutterData(data), by);
  if (m) return [{ id: "measure", labelKey: "mod.gutters.measureOpen" as const, icon: "pencil" as const, href: `${draw}?m=${encodeURIComponent(m.id)}` }];
  const q = [by.leadId ? `lead=${encodeURIComponent(by.leadId)}` : "", by.propertyId ? `property=${encodeURIComponent(by.propertyId)}` : ""].filter(Boolean).join("&");
  return [{ id: "measure", labelKey: "mod.gutters.measure" as const, icon: "pencil" as const, href: `${draw}?${q}` }];
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
    property: (ctx, data) => (ctx.propertyId ? measure(data, { propertyId: ctx.propertyId }) : []),
    // «Замерить здесь»: a draft without a lead (S1b → «Сделать заявкой»); the address by location — stage 3 (П21.2 №8)
    home: () => [{ id: "here", labelKey: "mod.gutters.measureHere", icon: "pencil", href: draw }],
    // the module's own card in «Компания → Модули»: the speed check saves nothing, so it is there even when off
    // the canvas draws even when off: it says at once that nothing will be saved (§6, founder О2)
    // «Настройки» (M7b, spec 33 П22): the director changes them, the office reads them; a tech or a seller never needs the page
    settings: (ctx) => [
      ...(ctx.role === "director" || ctx.role === "dispatcher"
        ? [
            { id: "settings", labelKey: "mod.gutters.set.action" as const, icon: "sliders" as const, href: moduleHref("gutters", "settings") },
            // «Цены и прайс» (M7d, spec 33 П22.10): labor prices and the parts' items of the company's price list
            { id: "prices", labelKey: "mod.gutters.pr.action" as const, icon: "box" as const, href: moduleHref("gutters", "prices") },
          ]
        : []),
      { id: "draw", labelKey: "mod.gutters.draw.action", icon: "pencil", href: draw },
      { id: "bench", labelKey: "mod.gutters.bench.action", icon: "clock", href: moduleHref("gutters", "bench") },
    ],
  },
  // the measurement's tables (spec 33 П19) and its changes (П21): DB.moduleData.gutters
  load: loadGutters,
  ops: guttersOps,
  rejectedKey: "mod.gutters.rejected",
  leadCreated: ({ ref, leadId }, store) => linkLead(store, ref, leadId),
  screens: {
    draw: () => require("./draw/DrawScreen").default,
    bench: () => require("./bench/BenchScreen").default,
    settings: () => require("./settings/SettingsScreen").default,
    prices: () => require("./prices/PricesScreen").default,
  },
};
export default gutters;
