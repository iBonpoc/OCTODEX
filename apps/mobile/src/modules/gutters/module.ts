/**
 * The Gutters module as the core sees it (docs/specs/33-gutters-module.md П15): found by src/modules/registry.ts.
 * Add-on $30 a month a company, 7-day trial (founder О1, О2, 07.11.2026). Places in core screens come with M5–M6.
 * Screens (spec 33-gutters-canvas П20.3): /module/gutters/bench — the canvas speed check; the canvas itself — M4b.
 */
import { moduleHref, type ModuleDef } from "../registry";

const gutters: ModuleDef = {
  key: "gutters",
  titleKey: "mod.gutters.title",
  hintKey: "mod.gutters.hint",
  trialDays: 7,
  priceCentsMonthly: 3000,
  places: {
    // the module's own card in «Компания → Модули»: the speed check saves nothing, so it is there even when off
    settings: () => [{ id: "bench", labelKey: "mod.gutters.bench.action", icon: "clock", href: moduleHref("gutters", "bench") }],
  },
  screens: {
    bench: () => require("./bench/BenchScreen").default,
  },
};
export default gutters;
