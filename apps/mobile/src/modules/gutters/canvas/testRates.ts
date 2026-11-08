/**
 * ТЕСТОВЫЕ ставки для $ под рисунком (CLAUDE.md rule 9: test prices only, marked «тестовые»; real prices never in code).
 * Cents per unit by `${section}.${unit}` of the engine's parts. The real estimate prices from the company's list (M8).
 */
import type { PreviewRates } from "@octo/estimating-engine";

export const TEST_RATES: PreviewRates = {
  "gutter.ft": 1000, // тестовая
  "gutter.ea": 0, // тестовая: куски секционного желоба входят в фут
  "corners_caps.ea": 1500, // тестовая
  "fasteners.ea": 0, // тестовая: крепления входят в фут водостока
  "fasteners.ft": 0, // тестовая
  "downspouts.ft": 900, // тестовая
  "downspouts.ea": 600, // тестовая
  "adapters.ea": 500, // тестовая
  "guards.ft": 800, // тестовая
  "guards.ea": 0, // тестовая
  "ds_bottom.ea": 800, // тестовая
  "ds_bottom.ft": 500, // тестовая
  "consumables.ea": 0, // тестовая
  "consumables.lb": 0, // тестовая
  "labor.ft": 300, // тестовая
  "labor.ea": 2500, // тестовая
};
