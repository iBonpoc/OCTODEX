/**
 * Estimate templates (docs/specs/07 §3.5, §11, wave E3b): a saved estimate without client, property or lead.
 * Core, trade-agnostic. All money math goes through @octo/estimating-engine (rule 8): this file only picks prices
 * (current catalog, else the template's) and never sums anything itself.
 */
import { DEFAULT_TAX, parseQty, type CustomLine, type CustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateDoc, EstimateTemplate } from "@/data/types";
import { canEditTemplates } from "./checklist";
import { catalogUnitCost, catalogUnitPrice, mainOption, optionTotals, uid } from "./estimateDoc";

/** The keys of a template line the server takes (app.valid_estimate_template_doc); a module's `source` never rides along */
type TemplateLine = Pick<CustomLine, "id" | "name" | "description" | "group" | "quantity" | "unit" | "unitPriceCents" | "unitCostCents" | "catalogItemId" | "optional" | "selected">;

/** text the server takes: no control characters, at most `n` characters (never half an emoji: by code points) */
// eslint-disable-next-line no-control-regex
export const cut = (v: string, n: number): string => Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, n).join("").trim();

function templateLine(l: CustomLine, withCost: boolean): TemplateLine {
  const q = parseQty(String(l.quantity));
  const out: TemplateLine = {
    id: uid(),
    name: cut(l.name, 300),
    group: l.group,
    // the engine's own decimal (no «1,5», no spaces): what the server checks; not a number — kept, and the check refuses
    quantity: q ?? String(l.quantity),
    unit: cut(l.unit, 20),
    unitPriceCents: l.unitPriceCents,
  };
  if (l.description) out.description = Array.from(l.description).slice(0, 2000).join("");
  if (l.catalogItemId) out.catalogItemId = l.catalogItemId;
  if (l.optional) {
    out.optional = true;
    out.selected = false;
  }
  // who does not see costs sends no key: the server then keeps what it had (spec 07 §11, E3b duty)
  if (withCost && l.unitCostCents !== undefined) out.unitCostCents = l.unitCostCents;
  return out;
}

/**
 * «Сохранить как шаблон»: the estimate's options, lines, add-ons, discount, tax, deposit and note — fresh ids, lines of a
 * module become plain lines (no measurement to recompute from, §11 №6), costs only for who sees them.
 */
export function toTemplateDoc(doc: EstimateDoc, costsVisible: boolean, taxExempt = false): EstimateDoc {
  return {
    options: doc.options.map((o) => ({
      id: uid(),
      name: cut(o.name, 120),
      ...(o.recommended ? { recommended: true } : {}),
      lines: o.lines.map((l) => templateLine(l, costsVisible)),
    })),
    // a tax-exempt client's estimate has its tax switched off (exemptDoc): the template must not carry that to others
    settings: taxExempt ? { ...doc.settings, tax: DEFAULT_TAX } : { ...doc.settings },
    ...(doc.note ? { note: Array.from(doc.note).slice(0, 5000).join("") } : {}),
  };
}

/** the doc without our costs + the costs by line id (DB keeps them apart: EstimateTemplate.costs) */
export function splitCosts(doc: EstimateDoc): { doc: EstimateDoc; costs: Record<string, number> } {
  const costs: Record<string, number> = {};
  const options = doc.options.map((o) => ({
    ...o,
    lines: o.lines.map(({ unitCostCents, ...l }) => {
      if (unitCostCents !== undefined) costs[l.id] = unitCostCents;
      return l;
    }),
  }));
  return { doc: { ...doc, options }, costs };
}

const QTY = /^([0-9]{1,12}([.][0-9]{1,12})?|[.][0-9]{1,12})$/;
const SHARE = /^(0([.][0-9]{1,6})?|1([.]0{1,6})?|[.][0-9]{1,6})$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const cents = (v: unknown, max = 1e11): boolean => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const text = (v: unknown, n: number): boolean => typeof v === "string" && Array.from(v).length <= n && !/[\u0000-\u001f\u007f]/.test(v);

/**
 * The server's check (app.valid_estimate_template_doc, migration 20261108230000) on the phone: a document it would
 * refuse is never queued (lesson of the director). Keep the two in step.
 */
export function validTemplateDoc(doc: EstimateDoc, costs: Record<string, number> = {}): boolean {
  if (JSON.stringify(doc).length > 262144 || doc.options.length < 1 || doc.options.length > 10) return false;
  if (doc.note != null && (typeof doc.note !== "string" || Array.from(doc.note).length > 5000)) return false;
  const lineIds = new Set<string>();
  const optIds = new Set<string>();
  for (const o of doc.options) {
    if (!ID.test(o.id) || optIds.has(o.id) || !text(o.name, 120) || o.lines.length > 200) return false;
    optIds.add(o.id);
    for (const l of o.lines) {
      if (!ID.test(l.id) || lineIds.has(l.id)) return false;
      lineIds.add(l.id);
      if (!text(l.name, 300) || !text(l.unit, 20) || !["service", "labor", "material"].includes(l.group)) return false;
      if (l.description != null && (typeof l.description !== "string" || Array.from(l.description).length > 2000)) return false;
      if (!QTY.test(String(l.quantity)) || !cents(l.unitPriceCents)) return false;
      const c = l.unitCostCents ?? costs[l.id];
      if (c !== undefined && !cents(c)) return false;
      if (l.catalogItemId != null && !ID.test(l.catalogItemId)) return false;
    }
  }
  const s = doc.settings;
  if (s.discount) {
    if (s.discount.kind === "fixed" ? !cents(s.discount.cents) : !SHARE.test(String(s.discount.value))) return false;
  }
  if (!cents(s.tax.rateBps, 10000)) return false;
  if (s.deposit.kind === "pct" ? !cents(s.deposit.bps, 10000) : s.deposit.kind === "fixed" ? !cents(s.deposit.cents) : false) return false;
  return true;
}

export interface FromTemplate {
  doc: EstimateDoc;
  /** ids (in the new doc) of lines whose catalog item is gone: the template's price, «нет в каталоге, проверьте цену» */
  checkPrice: string[];
}

/**
 * A new estimate's document from a template (S5t): fresh ids; a line linked to the catalog takes the CURRENT catalog
 * price (PRD 05 EST-02) and cost; a line without a link keeps the template's price and cost (`costs`: the template's
 * side table, empty for who does not see costs). Costs never reach a phone that may not see them.
 */
export function fromTemplate(tpl: EstimateDoc, catalog: CatalogItem[], costs: Record<string, number>, costsVisible: boolean): FromTemplate {
  const checkPrice: string[] = [];
  const options: CustomOption[] = tpl.options.map((o) => ({
    ...o,
    id: uid(),
    lines: o.lines.map((l) => {
      const id = uid();
      const { unitCostCents: _c, ...rest } = l;
      const line: CustomLine = { ...rest, id, selected: l.optional ? false : l.selected };
      if (l.catalogItemId) {
        const it = catalog.find((x) => x.id === l.catalogItemId);
        if (it && it.kind !== "kit") {
          line.unitPriceCents = catalogUnitPrice(it);
          const cost = catalogUnitCost(it);
          if (costsVisible && cost !== undefined) line.unitCostCents = cost;
          return line;
        }
        checkPrice.push(id);
      }
      const cost = costs[l.id];
      if (costsVisible && cost !== undefined) line.unitCostCents = cost;
      return line;
    }),
  }));
  return { doc: { options, settings: { ...tpl.settings }, ...(tpl.note ? { note: tpl.note } : {}) }, checkPrice };
}

/** «от $X» in the picker: the recommended option's total at today's catalog prices (the engine sums) */
export function templateFromCents(tpl: EstimateDoc, catalog: CatalogItem[]): number {
  const { doc } = fromTemplate(tpl, catalog, {}, false);
  return optionTotals(doc, mainOption(doc)).total;
}

/** who makes, changes and archives templates (§8; server: owner / admin / office = the app's director and dispatcher —
 *  the same rule as checklist templates); everyone uses them */
export const canEditEstimateTemplates = canEditTemplates;

export const ESTIMATE_TEMPLATE_NAME_MAX = 120;

/** a template the server takes: a name 1..120 without control characters, at least one option (else null: not queued) */
export function cleanEstimateTemplate(t: EstimateTemplate): EstimateTemplate | null {
  const name = cut(t.name, ESTIMATE_TEMPLATE_NAME_MAX);
  // our costs never sit in the doc (EstimateTemplate.costs): a cost put there by the save moves to `costs`
  const split = splitCosts(t.doc);
  const costs = { ...(t.costs ?? {}), ...split.costs };
  if (!name || !validTemplateDoc(split.doc, costs)) return null;
  return { ...t, name, doc: split.doc, ...(Object.keys(costs).length ? { costs } : {}) };
}

/** the picker and the list: live ones, last used first, then by name */
export function pickableTemplates(list: EstimateTemplate[]): EstimateTemplate[] {
  return list
    .filter((t) => !t.archivedAt)
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.name.localeCompare(b.name));
}
