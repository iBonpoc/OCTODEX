import type { Role } from "@/data/types";
import { canTakeVisitPayment } from "./moneyLists";

/**
 * #2018: what the visit's «Подпись» step offers, for every role and amount — never a dead end.
 * - `pay` — who may take the payment, something to pay: «Способ ⌄» + «Принять оплату» (as before);
 * - `close` — nothing to pay (the job is paid by invoice): «Закрыть выезд», no «$0.00» and no payment;
 * - `closeOffice` — who may not take the payment (sales), something to pay: the office takes it by the job's invoice;
 *   «Закрыть выезд» closes the visit with no payment written.
 */
export type SignedAction = "pay" | "close" | "closeOffice";

export function signedAction(role: Role, dueCents: number): SignedAction {
  if (!(dueCents > 0)) return "close";
  return canTakeVisitPayment(role) ? "pay" : "closeOffice";
}
