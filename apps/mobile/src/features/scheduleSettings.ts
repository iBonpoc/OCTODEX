/**
 * Schedule settings of the company (docs/specs/03-visit-and-plan.md §6.1, «П4 — этап 0», wave П4a). Business rules — not
 * design tokens. Stored in companies.schedule_settings (jsonb) and companies.business_hours (jsonb, null = defaults);
 * missing or junk keys fall back to the defaults below — the same limits as the database check
 * (app.valid_schedule_settings / app.valid_business_hours, migration 20261105370000). Pure — tested in test/scheduleSettings.test.ts.
 */
import type { Company, VisitKind } from "@/data/types";

export interface ScheduleSettings {
  /** default length of a visit by kind, minutes (15–720, a multiple of 15) */
  inspectionMin: number;
  jobMin: number;
  serviceMin: number;
  followUpMin: number;
  /** slots in the form */
  stepMin: number;
  /** what the client sees: 0 = the exact time, else a window from the start */
  arrivalWindowMin: number;
  /** a visit is late this many minutes after its start (docs/specs/03 П3c) */
  lateAfterMin: number;
}

export const SCHEDULE_SETTINGS_DEFAULT: ScheduleSettings = {
  inspectionMin: 45, jobMin: 120, serviceMin: 60, followUpMin: 60, stepMin: 30, arrivalWindowMin: 120, lateAfterMin: 15,
};

export const STEP_CHOICES = [15, 30, 60] as const;
export const WINDOW_CHOICES = [0, 60, 120, 180] as const;
export const LATE_RANGE = { min: 5, max: 60, step: 5 } as const;
export const DURATION_RANGE = { min: 15, max: 720, step: 15 } as const;

/** days of the week as stored (Date.getDay order: 0 = Sunday) */
export const WEEK_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
/** [start, end) in minutes from midnight; null = a day off */
export type DayHours = [number, number] | null;
export type BusinessHours = Record<WeekDay, DayHours>;

/** Monday–Saturday 8:00–18:00 (§6.1) */
export const BUSINESS_HOURS_DEFAULT: BusinessHours = {
  sun: null, mon: [480, 1080], tue: [480, 1080], wed: [480, 1080], thu: [480, 1080], fri: [480, 1080], sat: [480, 1080],
};

const DURATION_KEYS = ["inspectionMin", "jobMin", "serviceMin", "followUpMin"] as const;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** is this value allowed for this key (the same rule as the database check) */
export function validSetting(k: keyof ScheduleSettings, v: unknown): v is number {
  if (!isInt(v)) return false;
  if ((DURATION_KEYS as readonly string[]).includes(k)) return v >= DURATION_RANGE.min && v <= DURATION_RANGE.max && v % DURATION_RANGE.step === 0;
  if (k === "stepMin") return (STEP_CHOICES as readonly number[]).includes(v);
  if (k === "arrivalWindowMin") return (WINDOW_CHOICES as readonly number[]).includes(v);
  return v >= LATE_RANGE.min && v <= LATE_RANGE.max && v % LATE_RANGE.step === 0;
}

/** Company settings merged over the defaults; junk values are ignored. */
export function scheduleSettingsOf(company: Pick<Company, "scheduleSettings"> | null | undefined): ScheduleSettings {
  const raw = (company?.scheduleSettings ?? {}) as Partial<Record<keyof ScheduleSettings, unknown>>;
  const out = { ...SCHEDULE_SETTINGS_DEFAULT };
  for (const k of Object.keys(SCHEDULE_SETTINGS_DEFAULT) as (keyof ScheduleSettings)[]) {
    const v = raw[k];
    if (validSetting(k, v)) out[k] = v;
  }
  return out;
}

/** one day's hours: [start, end) inside the day, start < end; anything else is not valid */
export function validDayHours(v: unknown): v is DayHours {
  if (v === null) return true;
  return Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]) && v[0] >= 0 && v[1] <= 1440 && v[0] < v[1];
}

/** Working hours of the company by day; a missing or junk day keeps its default. */
export function businessHoursOf(company: Pick<Company, "businessHours"> | null | undefined): BusinessHours {
  const raw = (company?.businessHours ?? {}) as Partial<Record<WeekDay, unknown>>;
  const out = { ...BUSINESS_HOURS_DEFAULT };
  for (const d of WEEK_DAYS) if (d in raw && validDayHours(raw[d])) out[d] = raw[d] as DayHours;
  return out;
}

/** the hours of the weekday of this date (phone calendar day — the form is moved to the company time zone in П4b) */
export const hoursOn = (hours: BusinessHours, d: Date): DayHours => hours[WEEK_DAYS[d.getDay()]!];

/** default length of a visit of this kind */
export function durationFor(s: ScheduleSettings, kind: VisitKind | undefined): number {
  if (kind === "inspection") return s.inspectionMin;
  if (kind === "service") return s.serviceMin;
  if (kind === "follow_up") return s.followUpMin;
  return s.jobMin;
}

/** the arrival window the client is told: [start, start + window); null = the exact time */
export function arrivalWindow(startIso: string, s: Pick<ScheduleSettings, "arrivalWindowMin">): { from: string; to: string } | null {
  if (!s.arrivalWindowMin) return null;
  const t = new Date(startIso).getTime();
  if (Number.isNaN(t)) return null;
  return { from: startIso, to: new Date(t + s.arrivalWindowMin * 60_000).toISOString() };
}

/** the company's «late» threshold, for the screens that show a visit status */
export const lateAfterOf = (db: { company: Pick<Company, "scheduleSettings"> | null }) => scheduleSettingsOf(db.company).lateAfterMin;

/** «Los Angeles» from «America/Los_Angeles» */
export const tzLabel = (z: string) => (z.split("/")[1] ?? z).replace(/_/g, " ");

/** the company time zone; old data without one — Los Angeles (as the gate code and the server) */
export const companyTz = (company: Pick<Company, "timezone"> | null | undefined) => company?.timezone || "America/Los_Angeles";

/** «3:05 PM» of a moment on the company's clock (en-US); an unknown zone — Los Angeles */
export function companyTime(iso: string, tz: string): string {
  const o: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "America/Los_Angeles" }).format(new Date(iso));
  }
}

/** «Wed, Nov 6» of a moment on the company's calendar (what the client reads); an unknown zone — Los Angeles */
export function clientDate(iso: string, tz: string): string {
  const o: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "America/Los_Angeles" }).format(new Date(iso));
  }
}

/** Calendar day number of a moment in a time zone (the company's: the server decides by it too). */
export function dayIn(t: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  }
  const n = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return Math.floor(Date.UTC(n("year"), n("month") - 1, n("day")) / 86_400_000);
}
