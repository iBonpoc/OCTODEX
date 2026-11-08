/**
 * The Gutters module as the core sees it (docs/specs/33-gutters-module.md П15): found by src/modules/registry.ts.
 * Add-on $30 a month a company, 7-day trial (founder О1, О2, 07.11.2026). Places in core screens come with M5–M6.
 * Screens (spec 33-gutters-canvas П20.3–П20.4): /module/gutters/draw — the measuring canvas (M4b: one draft on the phone;
 * the entry from a lead and a property is M5), /module/gutters/bench — the canvas speed check.
 */
import { moduleHref, type ModuleDef } from "../registry";
import { guttersOps, loadGutters } from "./data";

const gutters: ModuleDef = {
  key: "gutters",
  titleKey: "mod.gutters.title",
  hintKey: "mod.gutters.hint",
  trialDays: 7,
  priceCentsMonthly: 3000,
  places: {
    // the module's own card in «Компания → Модули»: the speed check saves nothing, so it is there even when off
    // the canvas draws even when off: it says at once that nothing will be saved (§6, founder О2)
    settings: () => [
      { id: "draw", labelKey: "mod.gutters.draw.action", icon: "pencil", href: moduleHref("gutters", "draw") },
      { id: "bench", labelKey: "mod.gutters.bench.action", icon: "clock", href: moduleHref("gutters", "bench") },
    ],
  },
  // the measurement's tables (spec 33 П19) and its changes (П21): DB.moduleData.gutters
  load: loadGutters,
  ops: guttersOps,
  rejectedKey: "mod.gutters.rejected",
  screens: {
    draw: () => require("./draw/DrawScreen").default,
    bench: () => require("./bench/BenchScreen").default,
  },
};
export default gutters;
