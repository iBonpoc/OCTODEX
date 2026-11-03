import { computeGutterQuantities, COIL_WIDTH_IN, type GutterInput, type GutterQuantities, type Profile, type DsSize } from "./gutters.js";
import type { Line } from "./estimate.js";

/**
 * Turns gutter quantities into priced estimate lines using a price book (PRD 06 §7.7, PRD 04).
 * Visible lines carry price; BOM lines are hidden with price 0 and carry cost only.
 */

export interface PriceBookItem {
  name: string;
  priceCents: number;
  costCents: number;
  materialCents?: number;
  purchaseTaxBps?: number;
  taxable?: boolean;
  placeholder?: boolean; // "тестовая цена"
}
export type PriceBook = Record<string, PriceBookItem>;

export interface Preset {
  name: string;
  profile: Profile;
  gauge: string;
  dsSize: DsSize;
  guards: "none" | "optional" | "all";
}

/** System G/B/B presets of the Gutters module (PRD 06 §7.7). */
export const GBB_PRESETS: Preset[] = [
  { name: "Good", profile: "K5", gauge: ".027", dsSize: "2x3", guards: "optional" },
  { name: "Better", profile: "K6", gauge: ".032", dsSize: "3x4", guards: "optional" },
  { name: "Best", profile: "K6", gauge: ".032", dsSize: "3x4", guards: "all" },
];

export function applyPreset(input: GutterInput, p: Preset): GutterInput {
  return {
    ...input,
    runs: input.runs.map(r => ({ ...r, profile: p.profile, gauge: p.gauge, guards: p.guards === "all" ? true : false })),
    downspouts: input.downspouts.map(d => ({ ...d, size: p.dsSize })),
  };
}

export class PriceBookError extends Error {}

export function buildGutterLines(q: GutterQuantities, book: PriceBook, opts: { optionalGuardsLf?: string } = {}): Line[] {
  const lines: Line[] = [];
  const item = (sku: string): PriceBookItem => {
    const it = book[sku];
    if (!it) throw new PriceBookError(`Нет позиции каталога ${sku}`);
    return it;
  };
  const visible = (sku: string, qty: string | number, extra: Partial<Line> = {}) => {
    if (Number(qty) === 0) return;
    const it = item(sku);
    lines.push({
      sku, name: it.name, quantity: String(qty), unitPriceCents: it.priceCents, unitCostCents: it.costCents,
      unitMaterialCostCents: it.materialCents, purchaseTaxBps: it.purchaseTaxBps, taxable: it.taxable ?? false,
      clientVisible: true, ...extra,
    });
  };
  const hidden = (sku: string, qty: number) => {
    if (qty === 0) return;
    const it = item(sku);
    lines.push({
      sku, name: it.name, quantity: String(qty), unitPriceCents: 0, unitCostCents: it.costCents,
      unitMaterialCostCents: it.materialCents, purchaseTaxBps: it.purchaseTaxBps, taxable: false, clientVisible: false,
    });
  };

  for (const [k, lf] of Object.entries(q.gutterLf)) {
    const [profile, gauge] = k.split("|");
    visible(`gut.${profile}.${gauge}`, lf.toString());
  }
  for (const [story, lf] of Object.entries(q.storyFeeLf)) visible(`fee.story${story}`, lf.toString());
  for (const [size, lf] of Object.entries(q.downspoutLf)) visible(`ds.${size}`, lf.toString());
  visible("miter.out", q.mitersOut);
  visible("miter.in", q.mitersIn);
  for (const [k, n] of Object.entries(q.elbows)) visible(`elbow.${k}`, n);
  visible("rem.tearoff", q.tearOffLf.toString());
  visible("fee.tile", q.tileLf.toString());
  visible("fascia.repair", q.fasciaLf.toString());
  if (!q.guardsLf.isZero()) visible("guard.micromesh", q.guardsLf.toString());
  else if (opts.optionalGuardsLf && Number(opts.optionalGuardsLf) > 0) {
    visible("guard.micromesh", opts.optionalGuardsLf, { isOptional: true, selected: false });
  }

  for (const [type, n] of Object.entries(q.hangers)) hidden(`hanger.${type}`, n);
  for (const [profile, n] of Object.entries(q.endCaps)) hidden(`endcap.${profile}`, n);
  for (const [size, n] of Object.entries(q.outlets)) hidden(`outlet.${size}`, n);
  hidden("sealant", q.sealantTubes);
  hidden("screws", q.screwBoxes);
  for (const [k, n] of Object.entries(q.coilLf)) {
    const [width, gauge] = k.split("|");
    hidden(`coil.${width}.${gauge}`, n);
  }
  for (const size of Object.keys(q.downspoutLf)) {
    // sticks are counted overall; attribute them to the single size when only one is used
    if (Object.keys(q.downspoutLf).length === 1) hidden(`dsstick.${size}`, q.dsSticks);
  }
  return lines;
}

/** Build one option per G/B/B preset from one drawing. */
export function buildGbbOptions(input: GutterInput, book: PriceBook, presets: Preset[] = GBB_PRESETS) {
  return presets.map(p => {
    const q = computeGutterQuantities(applyPreset(input, p));
    const totalLf = Object.values(q.runLf).reduce((s, v) => s.add(v), q.tearOffLf.mul(0));
    const lines = buildGutterLines(q, book, { optionalGuardsLf: p.guards === "optional" ? totalLf.toString() : undefined });
    return { preset: p, quantities: q, lines };
  });
}

export { COIL_WIDTH_IN };
