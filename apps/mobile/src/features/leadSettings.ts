/**
 * Lead settings of the company (docs/14-leads-spec.md §6.1). Business thresholds — not design tokens.
 * Stored in companies.lead_settings (jsonb); missing keys fall back to the defaults below. Pure — tested in test/leadTurn.test.ts.
 */
import type { Company } from "@/data/types";

export interface LeadSettings {
  /** "Reply" turns yellow / red after this many minutes */
  replyWarnMin: number;
  replyBadMin: number;
  /** repeat push to the assignee after this many minutes without a reply */
  replyRepeatMin: number;
  /** repeat pushes only in business hours (the first push always goes at once) */
  repeatOnlyInBusinessHours: boolean;
  /** "Waiting for the client": suggest a reminder after N days of silence */
  remindDays: number;
  /** after the reminder: ask "lost or wait?" after N more days */
  lostOrWaitDays: number;
  /** "wait" answer pushes the question by N days */
  waitMoreDays: number;
  /** «Осмотр прошёл — сметы нет» in «Требует внимания» after N working days (docs/specs/03 §13.5), 1–10 */
  inspectionNoEstimateDays: number;
}

export const LEAD_SETTINGS_DEFAULT: LeadSettings = {
  replyWarnMin: 5,
  replyBadMin: 15,
  replyRepeatMin: 15,
  repeatOnlyInBusinessHours: true,
  remindDays: 3,
  lostOrWaitDays: 14,
  waitMoreDays: 7,
  inspectionNoEstimateDays: 1,
};
export const INSPECTION_NO_ESTIMATE_RANGE = { min: 1, max: 10 } as const;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Company settings merged over the defaults; junk values are ignored. */
export function leadSettingsOf(company: Pick<Company, "leadSettings"> | null | undefined): LeadSettings {
  const raw = (company?.leadSettings ?? {}) as Partial<Record<keyof LeadSettings, unknown>>;
  const out = { ...LEAD_SETTINGS_DEFAULT };
  for (const k of Object.keys(LEAD_SETTINGS_DEFAULT) as (keyof LeadSettings)[]) {
    const v = raw[k];
    if (typeof LEAD_SETTINGS_DEFAULT[k] === "boolean") {
      if (typeof v === "boolean") (out[k] as boolean) = v;
    } else if (isNum(v)) (out[k] as number) = v;
  }
  if (out.replyBadMin < out.replyWarnMin) out.replyBadMin = out.replyWarnMin;
  const r = INSPECTION_NO_ESTIMATE_RANGE;
  out.inspectionNoEstimateDays = Math.min(r.max, Math.max(r.min, Math.round(out.inspectionNoEstimateDays)));
  return out;
}
