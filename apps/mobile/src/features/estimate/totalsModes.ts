import type { DepositSetting, Discount } from "@octo/estimating-engine";

/**
 * The totals' rows «Скидка / Налог / Депозит» in one line each (founder 23.11, audit MAP §12 п.8; DS §8.7а): the word · `[% · Выкл. ·
 * $]` · the value · the sum. The switch's three positions and what a press on one writes — without a sheet.
 */
export type TotalsMode = "pct" | "off" | "fixed";

export const discountMode = (d: Discount): TotalsMode => (!d ? "off" : d.kind === "pct" ? "pct" : "fixed");
export const depositMode = (d: DepositSetting): TotalsMode => (d.kind === "none" ? "off" : d.kind);

/** what a row had in «%» and in «$» while the editor is open: «Выкл.» and back brings the typed value back (CRM review of #2454) */
export type ModeMemo<T> = Partial<Record<"pct" | "fixed", T>>;

/** what to remember of a value before the switch moves off it */
export function remember<T extends { kind: string } | null>(memo: ModeMemo<NonNullable<T>>, now: T): ModeMemo<NonNullable<T>> {
  if (!now || (now.kind !== "pct" && now.kind !== "fixed")) return memo;
  return { ...memo, [now.kind]: now };
}

/** a discount switched to % or $: what it had there before in this editor, else empty (0 — the person types it; a number of our own
 *  would change the client's sum by itself) */
export function discountFor(mode: TotalsMode, now: Discount, memo: ModeMemo<NonNullable<Discount>> = {}): Discount {
  if (mode === discountMode(now)) return now;
  if (mode === "off") return null;
  return memo[mode] ?? (mode === "pct" ? { kind: "pct", value: "0" } : { kind: "fixed", cents: 0 });
}

/** a deposit switched to %: what it had before, else 10 % (the usual US deposit; CA warns above $1,000); to $: before, else $0 */
export function depositFor(mode: TotalsMode, now: DepositSetting, memo: ModeMemo<DepositSetting> = {}): DepositSetting {
  if (mode === depositMode(now)) return now;
  if (mode === "off") return { kind: "none" };
  return memo[mode] ?? (mode === "pct" ? { kind: "pct", bps: 1000 } : { kind: "fixed", cents: 0 });
}

/** the sales tax has «%» and «Выкл.» only: a tax as a sum is the engine's (#2404) */
export const TAX_MODES: readonly TotalsMode[] = ["pct", "off"];
export const MONEY_MODES: readonly TotalsMode[] = ["pct", "off", "fixed"];
