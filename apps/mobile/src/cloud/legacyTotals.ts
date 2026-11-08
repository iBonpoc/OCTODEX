/**
 * The old quick estimate (estimate.add, a version with no document): what the phone shows is what the client signs.
 * The server signs it (sign_estimate_on_site, portal_accept) with app.estimate_option_totals of its first option — the
 * stored line totals, the option's discount, the version's tax and deposit rule. The phone showed totals.total and the
 * deposit the old app wrote instead (estimate.add: price = round(total / qty) is cents apart; its deposit rule
 * {"kind":"pct","value":"0.1"} has no bps — the server takes no deposit). Now both come from the same lines and the
 * same rule, through the engine (rule 8). Review #415, security-check №2. Pure: test/legacyTotals.test.ts (and T112).
 */
import { computeOption, depositAmount, type DepositSetting } from "@octo/estimating-engine";

export interface LegacyLine {
  lineTotalCents: number;
  taxable: boolean;
  optional: boolean;
  clientVisible: boolean;
}
export interface LegacyVersion {
  taxEnabled: boolean;
  taxRateBps: number | null;
  depositRule: unknown;
  discountMode: string | null;
  discountValue: number | null;
}

/** the server's deposit rule: pct by bps, fixed by cents; anything else (the old {"value": "0.1"}) — none */
export function serverDepositRule(rule: unknown): DepositSetting {
  const r = (rule ?? {}) as { kind?: unknown; bps?: unknown; cents?: unknown };
  if (r.kind === "pct" && typeof r.bps === "number" && Number.isFinite(r.bps)) return { kind: "pct", bps: r.bps };
  if (r.kind === "fixed" && typeof r.cents === "number" && Number.isFinite(r.cents)) return { kind: "fixed", cents: r.cents };
  return { kind: "none" };
}

/** total and deposit of the first option with no add-on, as app.estimate_option_totals(version, option, '{}') */
export function legacyTotals(lines: LegacyLine[], v: LegacyVersion): { totalCents: number; depositCents: number } {
  const counted = lines.filter((l) => l.clientVisible && !l.optional);
  const discount =
    v.discountMode === "pct" && v.discountValue !== null ? { kind: "pct" as const, value: String(v.discountValue / 10000) }
    : v.discountMode === "fixed" && v.discountValue !== null ? { kind: "fixed" as const, cents: v.discountValue }
    : null;
  const t = computeOption(
    counted.map((l, i) => ({ name: `line ${i + 1}`, quantity: 1, unitPriceCents: l.lineTotalCents, taxable: l.taxable })),
    { mode: "added_on_top", enabled: v.taxEnabled, rateBps: v.taxRateBps ?? 0 },
    discount,
  );
  return { totalCents: t.total, depositCents: depositAmount(t.total, serverDepositRule(v.depositRule)) };
}
