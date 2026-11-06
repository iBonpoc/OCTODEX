/**
 * The company's time zone for the whole app (docs/specs/03 «П4b — этап 0», вариант А). A day, «today», a deadline and a
 * wall-clock time are the company's (IANA zone, companies.timezone), not the phone's: the office in another state and
 * the server (it decides by companies.timezone) see the same day.
 * Pure functions take the zone as a parameter; getZone() is only the default at the edges (todayKey, formatters).
 * The store sets the zone from the company when the data loads. Tested in test/zone.test.ts (in several machine zones).
 */
export const DEFAULT_ZONE = "America/Los_Angeles";
/** the zone of the demo company (seed.ts): its «today», hours of visits and the daily reseed (persist.ts) */
export const DEMO_ZONE = DEFAULT_ZONE;
/** today of the demo company: the demo's «today» (seed.ts) and its daily reseed (persist.ts) */
export const demoToday = (now: number = Date.now()): DayKey => dayKeyIn(now, DEMO_ZONE);
let current = DEFAULT_ZONE;

/** the company's zone (or Los Angeles before a company is known) */
export const getZone = (): string => current;
/** set by the store from db.company.timezone; an unknown zone keeps Los Angeles */
export function setZone(tz: string | null | undefined): void {
  // the store calls this on every render: check a zone only when it changes
  const next = tz || DEFAULT_ZONE;
  if (next === current) return;
  current = validZone(next) ? next : DEFAULT_ZONE;
}
/** today of the company — the due day of a new invoice (cloud/ops.ts), as the server decides */
export const companyToday = (now: number = Date.now()): DayKey => dayKeyIn(now, getZone());

/** YYYY-MM-DD, a calendar day (no zone of its own) */
export type DayKey = string;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
/** one formatter per (zone, options) — formatters are slow to create and these run in lists */
export function zonedFormat(tz: string, opts: Intl.DateTimeFormatOptions, locale = "en-US"): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: DEFAULT_ZONE });
    }
    fmtCache.set(key, f);
  }
  return f;
}

export function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const PARTS_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" };

/** the wall clock of a moment in a zone: year, month (1–12), day, hour (0–23), minute, second */
export function wallOf(t: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = zonedFormat(tz, PARTS_OPTS).formatToParts(new Date(t));
  const n = (k: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  // some engines still answer «24» for midnight with h23
  return { y: n("year"), mo: n("month"), d: n("day"), h: n("hour") % 24, mi: n("minute"), s: n("second") };
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, mo: number, d: number): DayKey => `${y}-${pad(mo)}-${pad(d)}`;

/** Calendar day number (days since 1970-01-01) of a moment in a zone. */
export function dayIn(t: number, tz: string): number {
  const w = wallOf(t, tz);
  return Math.floor(Date.UTC(w.y, w.mo - 1, w.d) / 86_400_000);
}
/** the calendar day of a moment in a zone */
export function dayKeyIn(t: number | string, tz: string = getZone()): DayKey {
  const w = wallOf(typeof t === "string" ? new Date(t).getTime() : t, tz);
  return keyOf(w.y, w.mo, w.d);
}
/** minutes since the zone's midnight of a moment (10:30 → 630) */
export function minuteIn(t: number | string, tz: string = getZone()): number {
  const w = wallOf(typeof t === "string" ? new Date(t).getTime() : t, tz);
  return w.h * 60 + w.mi;
}

/** a day key ↔ day number (no zone: calendar arithmetic in UTC) */
export const dayNumber = (k: DayKey): number => {
  const [y, m, d] = k.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
};
export const keyOfNumber = (n: number): DayKey => {
  const d = new Date(n * 86_400_000);
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};
/** 0 = Sunday … 6 = Saturday of a calendar day (no phone zone involved) */
export const weekdayOf = (k: DayKey): number => new Date(dayNumber(k) * 86_400_000).getUTCDay();

/** offset of the zone at a moment: wall clock as if UTC − the moment, in ms */
function offsetAt(t: number, tz: string): number {
  const w = wallOf(t, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000;
}

/**
 * The moment of a wall-clock time of the company: «10:30 on 2026-11-06 in Los Angeles» → ISO.
 * Across a clock change it behaves like Temporal «compatible»: a time that does not exist (spring, 2:30) moves forward
 * by the gap (3:30); a time that happens twice (autumn, 1:30) is the earlier one (summer time).
 */
export function wallToInstant(day: DayKey, minute: number, tz: string = getZone()): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, 0) + minute * 60_000;
  const o1 = offsetAt(guess - offsetAt(guess, tz), tz);
  const o2 = offsetAt(guess - o1, tz);
  if (o1 === o2) {
    // a time that happens twice: the earlier moment has the larger (summer) offset
    const before = offsetAt(guess - o1 - 3_600_000, tz);
    const t = before > o1 && wallMatches(guess - before, tz, guess) ? guess - before : guess - o1;
    return new Date(t).toISOString();
  }
  // a gap (the wall time does not exist): take the later moment = the time moved forward by the gap
  return new Date(Math.max(guess - o1, guess - o2)).toISOString();
}
function wallMatches(t: number, tz: string, wallAsUtc: number): boolean {
  const w = wallOf(t, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) === wallAsUtc;
}

/**
 * A deadline as a calendar day of the company: «YYYY-MM-DD» stays as it is (cloud invoices); a full moment (demo, a
 * just-made invoice) is read on the company's calendar.
 */
export function dueDayKey(due: string, tz: string = getZone()): DayKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : dayKeyIn(due, tz);
}
/** whole calendar days from a to b (b − a) */
export const daysBetween = (a: DayKey, b: DayKey): number => dayNumber(b) - dayNumber(a);

/**
 * A label of a calendar day («Fri, Nov 6», a weekday in the calendar): a day key has no zone, so it is formatted in UTC
 * at noon — the same label on any phone and in any company zone.
 */
export const formatDayKey = (k: DayKey, opts: Intl.DateTimeFormatOptions, locale = "en-US"): string =>
  zonedFormat("UTC", opts, locale).format(new Date(dayNumber(k) * 86_400_000 + 43_200_000));

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const DAY_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
/** «10:30 AM» — a moment on the company's clock (useI18n().time), en-US in every app language */
export const timeLabel = (iso: string, tz: string = getZone()): string => zonedFormat(tz, TIME_OPTS).format(new Date(iso));
/** «Fri, Nov 6» — the company's day of a moment (useI18n().day) */
export const dayLabel = (iso: string, locale = "en-US", tz: string = getZone()): string => zonedFormat(tz, DAY_OPTS, locale).format(new Date(iso));
/** «Fri, Nov 6» — a calendar day of «План» and the form's chips (useI18n().dayOf) */
export const dayKeyLabel = (k: DayKey, locale = "en-US"): string => formatDayKey(k, DAY_OPTS, locale);
