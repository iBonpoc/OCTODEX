/** Date rules behind the lead sheets of wave L2 (features/lead/bookRules.ts). */
import { describe, expect, it } from "vitest";
import { bookStart, snoozeUntil } from "../src/features/lead/bookRules";

describe("estimate visit start", () => {
  it("today + N days at the picked minute, local time", () => {
    const now = new Date(2026, 10, 5, 15, 40); // Nov 5, 15:40 local
    const s = new Date(bookStart(1, 9 * 60 + 30, now));
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()]).toEqual([2026, 10, 6, 9, 30]);
  });
  it("rolls over the month end", () => {
    const s = new Date(bookStart(3, 8 * 60, new Date(2026, 10, 29, 12, 0)));
    expect([s.getMonth(), s.getDate(), s.getHours()]).toEqual([11, 2, 8]);
  });
});

describe("snooze until", () => {
  it("N months later at 9:00, so the lead comes back at the start of a work day", () => {
    const u = new Date(snoozeUntil(3, new Date(2026, 10, 5, 18, 0)));
    expect([u.getFullYear(), u.getMonth(), u.getDate(), u.getHours(), u.getMinutes()]).toEqual([2027, 1, 5, 9, 0]);
  });
  it("Jan 31 + 1 month = the last day of February, not March 3", () => {
    const u = new Date(snoozeUntil(1, new Date(2027, 0, 31, 10, 0)));
    expect([u.getMonth(), u.getDate()]).toEqual([1, 28]);
  });
});
