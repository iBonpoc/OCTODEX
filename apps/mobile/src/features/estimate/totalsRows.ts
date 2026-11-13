/**
 * «Итого ˅» of the estimate (DS §8.9, #1362): what the breakdown shows, from the engine's totals only (rule 8 — no sums
 * here). Pure: the panel, the totals card and the tests read the same rows.
 */
import { computeAllOptional, type CustomOption, type CustomTotals } from "@octo/estimating-engine";
import type { EstimateDoc } from "@/data/types";

export type TotalsRow =
  | { key: "subtotal" | "discount" | "tax" | "total" | "deposit" | "ifAll"; cents: number }
  | { key: "cost"; cents: number | null }
  | { key: "profit"; cents: number | null; pct: string | null; loss: boolean };

export interface TotalsFor {
  /** the option's totals (the engine's) */
  totals: CustomTotals;
  /** the same option with every «на выбор клиента» line ticked (computeAllOptional) — null: nothing to tick */
  allOptional: CustomTotals | null;
  /** who sees costs and profit (not the tech), and not «Экран для клиента» */
  own: boolean;
  /** every counted line has a cost: else cost and profit are not known («—») */
  costKnown: boolean;
}

/** the client's part (what the client may read) and «Только для вас» (cost, profit — only `own`) */
export function totalsRows(x: TotalsFor): { client: TotalsRow[]; own: TotalsRow[] } {
  const t = x.totals;
  const client: TotalsRow[] = [{ key: "subtotal", cents: t.subtotal }];
  if (t.discount) client.push({ key: "discount", cents: t.discount });
  if (t.tax) client.push({ key: "tax", cents: t.tax });
  client.push({ key: "total", cents: t.total });
  if (t.deposit) client.push({ key: "deposit", cents: t.deposit });
  if (x.allOptional && x.allOptional.total !== t.total) client.push({ key: "ifAll", cents: x.allOptional.total });
  // nothing in the estimate yet: no «$0 cost, $0 profit» (the old caption was hidden at no cost too)
  const own: TotalsRow[] = x.own && (t.subtotal !== 0 || t.cost !== 0)
    ? [
        { key: "cost", cents: x.costKnown ? t.cost : null },
        { key: "profit", cents: x.costKnown ? t.margin : null, pct: x.costKnown ? t.marginPct : null, loss: x.costKnown && t.margin < 0 },
      ]
    : [];
  return { client, own };
}

/**
 * «Если клиент включит всё на выбор» for the editor: the settings as counted (`counted` — exemptDoc: a tax-exempt client's
 * tax is off here too, as in the total above it); a signed estimate — none (the client has decided: no offer any more)
 */
export function allOptionalFor(counted: Pick<EstimateDoc, "settings">, option: CustomOption, signed: boolean): CustomTotals | null {
  return signed ? null : computeAllOptional(option, counted.settings);
}
