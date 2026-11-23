import type { DepositSetting, Discount } from "@octo/estimating-engine";

/**
 * The totals' rows «Скидка / Налог / Депозит» in one line each (founder 23.11, audit MAP §12 п.8; DS §8.7а): the word · `[% · Выкл. ·
 * $]` · the value · the sum. The switch's three positions and what a press on one writes — without a sheet.
 */
export type TotalsMode = "pct" | "off" | "fixed";

export const discountMode = (d: Discount): TotalsMode => (!d ? "off" : d.kind === "pct" ? "pct" : "fixed");
export const depositMode = (d: DepositSetting): TotalsMode => (d.kind === "none" ? "off" : d.kind);

/** a discount switched to %: 5 % to start (the field is right there to change it); to $: $0 — the person types it */
export function discountFor(mode: TotalsMode, now: Discount): Discount {
  if (mode === discountMode(now)) return now;
  return mode === "off" ? null : mode === "pct" ? { kind: "pct", value: "0.05" } : { kind: "fixed", cents: 0 };
}

/** a deposit switched to %: 10 % to start; to $: $0 */
export function depositFor(mode: TotalsMode, now: DepositSetting): DepositSetting {
  if (mode === depositMode(now)) return now;
  return mode === "off" ? { kind: "none" } : mode === "pct" ? { kind: "pct", bps: 1000 } : { kind: "fixed", cents: 0 };
}

/** the sales tax has «%» and «Выкл.» only: a tax as a sum is the engine's (#2404) */
export const TAX_MODES: readonly TotalsMode[] = ["pct", "off"];
export const MONEY_MODES: readonly TotalsMode[] = ["pct", "off", "fixed"];
