/**
 * The old quick estimate (estimate.add, a version with no document): what the phone shows is what the client signs.
 * The server signs it (sign_estimate_on_site, portal_accept) with app.estimate_option_totals of its first option — the
 * stored line totals, the option's discount, the version's tax and deposit rule. The phone showed totals.total and the
 * deposit the old app wrote instead (estimate.add: price = round(total / qty) is cents apart; its deposit rule
 * {"kind":"pct","value":"0.1"} has no bps — the server takes no deposit). Now both come from the same lines and the
 * same rule, through the engine (rule 8). Not mirrored: negative sums (a legacy estimate has none). Review #415, security-check №2. Pure: test/legacyTotals.test.ts (and T121).
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
  // the server reads (rule ->> 'bps')::numeric and (rule ->> 'cents')::bigint: a number or a numeric string (review PR-B №6)
  const r = (rule ?? {}) as { kind?: unknown; bps?: unknown; cents?: unknown };
  const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) ? Number(v) : NaN);
  if (r.kind === "pct" && Number.isFinite(num(r.bps))) return { kind: "pct", bps: num(r.bps) };
  if (r.kind === "fixed" && Number.isFinite(num(r.cents))) return { kind: "fixed", cents: num(r.cents) };
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

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * The glue of repo.ts (director's review #420 №2): for an estimate row, the totals the client will sign — or null.
 * The version the server signs (sign_estimate_on_site): sent_version_id while the estimate is sent / viewed, else the
 * current one; its first option by position, created_at. Only a version with no document; a signed estimate keeps what
 * was signed (selection, else the old totals — review PR-B №2).
 */
export function legacyForEstimate(
  e: Row,
  d: { versionOf: Map<string, Row>; options: Row[]; lines: Row[]; signed: boolean },
): { totalCents: number; depositCents: number } | null {
  if (d.signed) return null;
  const open = e.status === "sent" || e.status === "viewed";
  const ver = (open ? d.versionOf.get(str(e.sent_version_id)) : undefined) ?? d.versionOf.get(str(e.current_version_id));
  if (!ver || ver.calc_inputs != null) return null;
  const opt = d.options
    .filter((o) => o.version_id === ver.id)
    .sort((a, b) => num(a.position) - num(b.position) || str(a.created_at).localeCompare(str(b.created_at)))[0];
  if (!opt) return null;
  return legacyTotals(
    d.lines.filter((l) => l.option_id === opt.id).map((l) => ({ lineTotalCents: num(l.line_total_cents), taxable: !!l.taxable, optional: !!l.is_optional, clientVisible: l.client_visible !== false })),
    {
      taxEnabled: !!ver.tax_enabled, taxRateBps: ver.tax_rate_bps == null ? null : num(ver.tax_rate_bps), depositRule: ver.deposit_rule,
      discountMode: (opt.discount_mode as string | null) ?? null, discountValue: opt.discount_value == null ? null : num(opt.discount_value),
    },
  );
}
