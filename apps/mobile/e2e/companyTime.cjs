/**
 * The company's day and clock for e2e expectations (docs/specs/03 П4b): the app shows days and times of the company
 * (the demo company is in Los Angeles), while the browser runs in the machine's zone (UTC on CI) — that is the «phone in
 * another zone». A spec computes what it expects here, never with the browser's getHours / setHours / toDateString.
 */
const ZONE = "America/Los_Angeles";

const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function wall(t) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, minute: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** YYYY-MM-DD of a moment (ISO or ms) on the company's calendar */
const dayKey = (t) => wall(typeof t === "string" ? new Date(t).getTime() : t).key;
/** today of the company */
const todayKey = () => dayKey(Date.now());
/** minutes after the company's midnight of a moment (13:00 → 780) */
const minuteOf = (t) => wall(typeof t === "string" ? new Date(t).getTime() : t).minute;
/** a day key + n days */
const addDays = (k, n) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** 0 = Sunday … 6 = Saturday of a calendar day */
const weekday = (k) => new Date(`${k}T12:00:00Z`).getUTCDay();
/** the moment of a minute of a company day (minute steps around the guess; the demo never books 1–3 AM in a clock change) */
function atMinute(k, minute) {
  const [y, m, d] = k.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d, 0, minute);
  for (let i = 0; i < 2; i++) {
    const w = wall(t);
    const [wy, wm, wd] = w.key.split("-").map(Number);
    t += Date.UTC(y, m - 1, d, 0, minute) - Date.UTC(wy, wm - 1, wd, 0, w.minute);
  }
  return new Date(t).toISOString();
}
/** the form's day chip of the first working day (Mon–Sat by default, П4a) at least `from` days after the company's today */
const workdayOffset = (from) => {
  for (let o = from; ; o++) if (weekday(addDays(todayKey(), o)) !== 0) return o;
};

/** a deadline as a company day: «YYYY-MM-DD» as it is, a full moment on the company's calendar (as zone.ts dueDayKey) */
const dueKey = (due) => (/^\d{4}-\d{2}-\d{2}$/.test(due) ? due : dayKey(due));

module.exports = { ZONE, dayKey, todayKey, minuteOf, addDays, weekday, atMinute, workdayOffset, dueKey };
