/**
 * «Принять оплату» — the amount (#2217, visual v2 «Шторка»): the rules of the sheet's sum, pure (test/payAmount.test.ts).
 * The sum is typed on the system number keyboard (decimal-pad: no keyboard of our own), shown large in tabular figures, and set in
 * one tap by the quick amounts «Весь остаток · Половина · Задаток». Every figure goes through the engine (rule 8): parsing, the half,
 * the cap at the balance, the US format.
 */
import { acceptPayment, fmtUsd, parseMoneyToCents, progressAmount } from "@octo/estimating-engine";

export type QuickKey = "all" | "half" | "deposit";
export type QuickAmount = { key: QuickKey; cents: number };

/**
 * The quick amounts of a balance: the whole balance; half of it (the engine rounds half a cent up, never more than the balance);
 * the deposit of the job's estimate when it is a part of the balance (none, or the whole — no button of its own). Nothing is owed —
 * no buttons. Two buttons with the same sum — one.
 */
export function quickAmounts(balanceCents: number, depositCents?: number): QuickAmount[] {
  if (balanceCents <= 0) return [];
  const out: QuickAmount[] = [{ key: "all", cents: balanceCents }];
  const half = progressAmount(balanceCents, 0, 5000);
  if (half > 0 && half < balanceCents) out.push({ key: "half", cents: half });
  const dep = depositCents ?? 0;
  if (dep > 0 && dep < balanceCents && !out.some((q) => q.cents === dep)) out.push({ key: "deposit", cents: dep });
  return out;
}

/** which quick amount the typed sum is (its button is shown chosen), if any */
export const quickChosen = (amountCents: number, quick: readonly QuickAmount[]): QuickKey | undefined => quick.find((q) => q.cents === amountCents)?.key;

/** what was typed, in cents, by the engine: «1,840.5» → 184050, «$12» → 1200; nothing typed → 0; not a sum → null (the field says so) */
export const typedCents = (text: string): number | null => (text.trim() === "" ? 0 : parseMoneyToCents(text));

/** what is recorded: never above the balance (the engine's acceptPayment), never below 0 */
export const recordedCents = (amountCents: number, balanceCents: number): number => acceptPayment({ totalCents: balanceCents, paidCents: 0 }, amountCents);

/** the large figure of the sheet, «$1,840.00» (US format, rule 7; through the engine) */
export const bigAmount = (cents: number): string => fmtUsd(cents);
