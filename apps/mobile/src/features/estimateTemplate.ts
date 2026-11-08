/**
 * Estimate templates (docs/specs/07 §3.5, §11, wave E3b): a saved estimate without client, property or lead.
 * Core, trade-agnostic. All money math goes through @octo/estimating-engine (rule 8): this file only picks prices
 * (current catalog, else the template's) and never sums anything itself.
 */
import { parseQty, type CustomLine, type CustomOption } from "@octo/estimating-engine";
import type { CatalogItem, EstimateDoc } from "@/data/types";
import { catalogUnitCost, catalogUnitPrice, mainOption, optionTotals, uid } from "./estimateDoc";

/** The keys of a template line the server takes (app.valid_estimate_template_doc); a module's `source` never rides along */
type TemplateLine = Pick<CustomLine, "id" | "name" | "description" | "group" | "quantity" | "unit" | "unitPriceCents" | "unitCostCents" | "catalogItemId" | "optional" | "selected">;

function templateLine(l: CustomLine, withCost: boolean): TemplateLine {
  const q = parseQty(String(l.quantity));
  const out: TemplateLine = {
    id: uid(),
    name: l.name,
    group: l.group,
    // the engine's own decimal (no «1,5», no spaces): what the server checks
    quantity: q ?? "0",
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
  };
  if (l.description) out.description = l.description;
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
export function toTemplateDoc(doc: EstimateDoc, costsVisible: boolean): EstimateDoc {
  return {
    options: doc.options.map((o) => ({
      id: uid(),
      name: o.name,
      ...(o.recommended ? { recommended: true } : {}),
      lines: o.lines.map((l) => templateLine(l, costsVisible)),
    })),
    settings: { ...doc.settings },
    ...(doc.note ? { note: doc.note } : {}),
  };
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
