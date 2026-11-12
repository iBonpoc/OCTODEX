/**
 * What a universal estimate's document becomes on the server (estimate.save → estimate_versions, estimate_options,
 * estimate_line_items): the parts that count its totals. The server signs with app.estimate_option_totals over these rows
 * (sign / accept on site, the client page); the phone shows summarize(doc) to the client — the two must agree, or the
 * client's signature is refused for a total that only looks different (#1147). Pure: test/signTotals.test.ts and T195
 * read the same examples (test/fixtures/signTotals.json).
 */
import { discountBps, jobLineQty, type DecLike } from "@octo/estimating-engine";
import type { EstimateDoc } from "@/data/types";

/** A line's quantity as estimate_line_items keeps it; a text that is not a number goes as before (the server says no). */
export const storedQty = (q: DecLike): string | number => {
  try {
    return jobLineQty(q);
  } catch {
    return Number(q as string);
  }
};

export interface VersionRows {
  taxEnabled: boolean;
  taxRateBps: number;
  options: { id: string; position: number; name: string; isRecommended: boolean; discountMode: "pct" | "fixed" | null; discountValue: number | null }[];
  lines: {
    id: string; optionId: string; position: number; group: string; catalogItemId?: string; name: string; description: string | null;
    quantity: string | number; unit: string; unitPriceCents: number; taxable: boolean; isOptional: boolean;
    /** hidden from the client — only at $0 (the engine and the server's check: client_visible or price 0) */
    clientVisible?: false;
  }[];
}

/** the rows estimate.save writes for this document (the same mapping, now in one place) */
export function versionRows(doc: EstimateDoc): VersionRows {
  const s = doc.settings;
  const taxOn = s.tax.enabled && Object.values(s.tax.groups).some(Boolean);
  return {
    taxEnabled: taxOn,
    taxRateBps: s.tax.rateBps,
    options: doc.options.map((o, i) => ({
      id: o.id, position: i, name: o.name, isRecommended: !!o.recommended,
      discountMode: s.discount ? s.discount.kind : null,
      discountValue: s.discount ? (s.discount.kind === "pct" ? discountBps(s.discount.value) : s.discount.cents) : null,
    })),
    lines: doc.options.flatMap((o) =>
      o.lines
        .filter((l) => l.name.trim() !== "" || l.unitPriceCents !== 0)
        .map((l, i) => ({
          id: l.id, optionId: o.id, position: i, group: l.group, ...(l.catalogItemId ? { catalogItemId: l.catalogItemId } : {}),
          name: l.name.trim() || "—", description: l.description ?? null,
          // the stored quantity (numeric(14,4)) — the same the engine counts (Н1): the lock check finds no difference
          quantity: storedQty(l.quantity), unit: l.unit || "ea", unitPriceCents: l.unitPriceCents,
          taxable: taxOn && !!s.tax.groups[l.group], isOptional: !!l.optional,
          ...(l.clientVisible === false && l.unitPriceCents === 0 ? { clientVisible: false as const } : {}),
        })),
    ),
  };
}
