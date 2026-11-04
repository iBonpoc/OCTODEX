/**
 * Universal estimate helpers (core, trade-agnostic). All money math goes through @octo/estimating-engine.
 */
import {
  activeLines,
  catalogPrice,
  computeCustomOption,
  DEFAULT_TAX,
  type CustomLine,
  type CustomOption,
  type CustomSettings,
  type CustomTotals,
  type LineGroup,
} from "@octo/estimating-engine";
import type { CatalogItem, Estimate, EstimateDoc } from "@/data/types";

/** UUID: Web Crypto when present (web, Node tests), expo-crypto on the phone. */
export const uid = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("expo-crypto") as typeof import("expo-crypto")).randomUUID();
};
export const MAX_OPTIONS = 3;
export const OPTION_NAMES = ["Good", "Better", "Best"];

export const DEFAULT_SETTINGS: CustomSettings = {
  discount: null,
  tax: DEFAULT_TAX,
  deposit: { kind: "pct", bps: 1000 },
  caHic: true,
};

export const newLine = (group: LineGroup, over: Partial<CustomLine> = {}): CustomLine => ({
  id: uid(),
  name: "",
  group,
  quantity: "1",
  unit: group === "labor" ? "hr" : "ea",
  unitPriceCents: 0,
  ...over,
});

export const newOption = (i: number, lines: CustomLine[] = []): CustomOption => ({ id: uid(), name: OPTION_NAMES[i] ?? `Option ${i + 1}`, lines });

/** New estimate; the company's default deposit applies (Company → Documents). */
export function newDoc(defaultDepositBps?: number | null): EstimateDoc {
  const deposit = defaultDepositBps === undefined ? DEFAULT_SETTINGS.deposit : defaultDepositBps === null ? ({ kind: "none" } as const) : ({ kind: "pct", bps: defaultDepositBps } as const);
  return { options: [newOption(0)], settings: { ...DEFAULT_SETTINGS, deposit } };
}

/** A copy of an option with fresh ids (for "add option"). */
export function cloneOption(o: CustomOption, i: number): CustomOption {
  return { id: uid(), name: OPTION_NAMES[i] ?? `Option ${i + 1}`, lines: o.lines.map((l) => ({ ...l, id: uid() })) };
}

/** Unit price of a catalog item (materials: purchase + supplier tax + markup). */
export function catalogUnitPrice(it: CatalogItem): number {
  if (it.kind === "material" && it.costCents !== undefined) return catalogPrice(it.costCents, it.vendorTaxBps ?? 0, it.markupBps ?? 0);
  return it.priceCents;
}
/** Our cost per unit incl. supplier tax (hidden from the client). */
export function catalogUnitCost(it: CatalogItem): number | undefined {
  if (it.costCents === undefined) return undefined;
  return catalogPrice(it.costCents, it.vendorTaxBps ?? 0, 0);
}

/** Lines from a catalog item; a kit expands into its components (each lands in its own group). */
export function linesFromCatalog(it: CatalogItem, catalog: CatalogItem[], qty = "1"): CustomLine[] {
  if (it.kind === "kit") {
    return (it.components ?? []).flatMap((c) => {
      const sub = catalog.find((x) => x.id === c.itemId);
      if (!sub || sub.kind === "kit") return [];
      return linesFromCatalog(sub, catalog, c.qty);
    });
  }
  return [
    newLine(it.kind, {
      name: it.name,
      description: it.description,
      unit: it.unit,
      quantity: qty,
      unitPriceCents: catalogUnitPrice(it),
      unitCostCents: catalogUnitCost(it),
      catalogItemId: it.id,
    }),
  ];
}

/** Kit price = Σ component price × qty (shown in the catalog). */
export function kitPrice(it: CatalogItem, catalog: CatalogItem[]): number {
  const o = { id: "k", name: it.name, lines: linesFromCatalog(it, catalog) };
  return computeCustomOption(o, { ...DEFAULT_SETTINGS, deposit: { kind: "none" } }).subtotal;
}

export const optionTotals = (doc: EstimateDoc, o: CustomOption): CustomTotals => computeCustomOption(o, doc.settings);

/** Margin is meaningful only when every counted line has a cost (typed lines often have none). */
export const costComplete = (o: CustomOption): boolean =>
  activeLines(o.lines).filter((l) => !l.optional || l.selected).every((l) => l.unitCostCents !== undefined);

/** Option shown by default: recommended, else the first. */
export const mainOption = (doc: EstimateDoc): CustomOption => doc.options.find((o) => o.recommended) ?? doc.options[0]!;

/** Apply the client's choice of add-ons to an option. */
export const withAddons = (o: CustomOption, addonIds: string[]): CustomOption => ({
  ...o,
  lines: o.lines.map((l) => (l.optional ? { ...l, selected: addonIds.includes(l.id) } : l)),
});

/** Remove costs before anything leaves for the client (portal, PDF, calc_inputs in the database). */
export function clientDoc(doc: EstimateDoc): EstimateDoc {
  return {
    ...doc,
    options: doc.options.map((o) => ({ ...o, lines: o.lines.map(({ unitCostCents: _c, ...l }) => l) })),
  };
}

/** Summary fields kept on Estimate for lists (total, deposit, visible lines of the main option). */
export function summarize(doc: EstimateDoc, approved?: { optionId: string; addonIds: string[] }) {
  const base = (approved && doc.options.find((o) => o.id === approved.optionId)) || mainOption(doc);
  const o = approved ? withAddons(base, approved.addonIds) : base;
  const t = optionTotals(doc, o);
  return {
    totalCents: t.total,
    depositCents: t.deposit,
    marginPct: costComplete(o) ? t.marginPct : null,
    lines: activeLines(o.lines).map((l, i) => ({ name: l.name.trim() || "—", qty: String(l.quantity), totalCents: t.lineTotals[i] ?? 0, optional: l.optional })),
  };
}

export const hasContent = (doc: EstimateDoc) => doc.options.some((o) => o.lines.some((l) => l.name.trim() && l.unitPriceCents >= 0));

/** Long random secret for the client link (not guessable). */
export function newToken(): string {
  return uid().replace(/-/g, "") + uid().replace(/-/g, "").slice(0, 8);
}

export function estimateTitle(doc: EstimateDoc, fallback: string): string {
  const names = mainOption(doc).lines.filter((l) => l.name.trim() && !l.optional).map((l) => l.name.trim());
  if (!names.length) return fallback;
  const s = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${s} +${names.length - 3}` : s;
}

export const isUniversal = (e: Estimate): e is Estimate & { doc: EstimateDoc } => !!e.doc?.options?.length;
