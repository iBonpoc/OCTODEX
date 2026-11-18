/**
 * The amount of a new expense (#1537, rule 8): the app's one money parser (`parseCents`, ui/numberInput — the engine's
 * parseMoneyToCents underneath) — «12,50» is $12.50 (a decimal comma, not $1,250), more than two decimals, a minus, letters
 * or a sum above the app's limit are no amount (0: «Сохранить» waits). The same rule as every money field (NumberField).
 */
import { parseCents } from "@/ui/numberInput";

export function expenseAmountCents(text: string): number {
  const p = parseCents(text);
  return p.state === "ok" ? p.value : 0;
}
