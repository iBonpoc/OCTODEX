/**
 * The old quick estimate (estimate.add, a version with no document): what the phone shows is what the client signs.
 * The server signs it (sign_estimate_on_site, portal_accept) with app.estimate_option_totals of its first option — the
 * stored line totals, the option's discount, the version's tax and deposit rule. The phone showed totals.total and the
 * deposit the old app wrote instead (estimate.add: price = round(total / qty) is cents apart). Its deposit rule
 * {"kind":"pct","value":"0.1"} is 10 % (#544, migration 20261110140000: the server reads the share when there is no bps).
 * Now both come from the same lines and the same rule, through the engine (rule 8). Not mirrored: negative sums (a legacy estimate has none). Review #415, security-check №2. Pure: test/legacyTotals.test.ts (and T121).
 */
import { computeOption, depositAmount, depositSettingFromRule, type DepositSetting } from "@octo/estimating-engine";
import type { Estimate } from "@/data/types";

export interface LegacyLine {
  lineTotalCents: number;
  taxable: boolean;
  optional: boolean;
  clientVisible: boolean;
}
export interface LegacyVersion {
  taxEnabled: boolean;
  taxRateBps: number | null;
  /** #1219: estimate_versions.tax_rate_ppm (null: the basis points are the rate) */
  taxRatePpm?: number | null;
  depositRule: unknown;
  discountMode: string | null;
  discountValue: number | null;
}

/** the server's deposit rule (app.estimate_option_totals): pct by bps, else by the share in value (the quick estimate's
 * "0.1" = 10 %, #544), fixed by cents, anything else — none; the engine reads it (depositSettingFromRule) */
export function serverDepositRule(rule: unknown): DepositSetting {
  return depositSettingFromRule(rule);
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
    { mode: "added_on_top", enabled: v.taxEnabled, rateBps: v.taxRateBps ?? 0, ratePpm: v.taxRatePpm ?? undefined },
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
      taxEnabled: !!ver.tax_enabled, taxRateBps: ver.tax_rate_bps == null ? null : num(ver.tax_rate_bps), taxRatePpm: ver.tax_rate_ppm == null ? null : num(ver.tax_rate_ppm), depositRule: ver.deposit_rule,
      discountMode: (opt.discount_mode as string | null) ?? null, discountValue: opt.discount_value == null ? null : num(opt.discount_value),
    },
  );
}

/**
 * #1147: the total the server will count for a quick estimate this phone made (estimate.add writes each line's price as
 * Math.round(total / qty) — ops.ts — and the server sums floor(qty × price + 0.5)), its first option, no add-on, no tax
 * or discount (estimate.add sets none). When it is not the total the phone shows, the signature goes without the total
 * (the door without it): a few cents of our own rounding are not «the estimate changed».
 */
export function addedTotalCents(lines: { qty: string; totalCents: number; optional?: boolean }[]): number {
  const t = computeOption(
    lines.filter((l) => !l.optional).map((l, i) => {
      const qty = Number(l.qty) || 1;
      return { name: `line ${i + 1}`, quantity: qty, unitPriceCents: Math.round(l.totalCents / qty), taxable: false };
    }),
    { mode: "added_on_top", enabled: false, rateBps: 0 },
    null,
  );
  return t.total;
}

/**
 * #1147: the total a quick estimate's on-site signature carries — the one the phone showed — or none (the door without
 * the total) when the server will count it from this phone's own estimate.add rows a few cents apart (Math.round of the
 * line prices): while that op is still queued, or when its rounding makes another total (addedTotalCents).
 */
export function signTotalFor(e: Pick<Estimate, "totalCents" | "lines"> | undefined, addQueued: boolean): { totalCents?: number } {
  if (!e || addQueued) return {};
  if (e.lines?.length && addedTotalCents(e.lines) !== e.totalCents) return {};
  return { totalCents: e.totalCents };
}
