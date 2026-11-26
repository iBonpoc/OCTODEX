/**
 * The second line of a folded estimate row (visual v2 №5 «Смета, редактор»): «120 sq ft × $1.50», one of a thing — «1 ea» (the sum
 * on the right says the price); a line the client may choose — «по желанию клиента · 1 room». Money in the engine's US format with
 * cents (`fmtUsd`, rule 7/8). Pure; unit-tested in test/rowLine.test.ts.
 */
import { fmtUsd, type CustomLine } from "@octo/estimating-engine";

export function rowQtyLine(l: Pick<CustomLine, "quantity" | "unit" | "unitPriceCents">, shownQty: (q: CustomLine["quantity"]) => string): string {
  const q = shownQty(l.quantity);
  const qty = [q, l.unit].filter((x) => x && String(x).trim() !== "").join(" ");
  return q === "1" ? qty : `${qty} × ${fmtUsd(l.unitPriceCents)}`;
}

/**
 * Money in the estimate editor: always with cents, as the mockup's «$150.00» / «$772.36» (DS §4.5 «в документах — с центами»; the sums
 * of a document line up by the point, #2451 «Сумма $36», #2457 «$200 и $200.00»). The app's `money` is the same since #2888 (always
 * with cents, #2672). A negative amount takes «−» (U+2212). Pure, the engine's `fmtUsd`.
 */
export const docMoney = (cents: number): string => fmtUsd(cents);
/** the row's sum on the right (the same, kept under its old name) */
export const rowSum = docMoney;
