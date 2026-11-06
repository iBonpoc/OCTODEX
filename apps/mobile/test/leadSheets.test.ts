/** Date rules behind the lead sheets of wave L2 (features/lead/bookRules.ts): days and hours of the company (П4b). */
import { describe, expect, it } from "vitest";
import { bookStart, dayAtHour, snoozeUntil } from "../src/features/lead/bookRules";

const LA = "America/Los_Angeles";

describe("estimate visit start", () => {
  it("the company's today + N days at the picked minute of its clock", () => {
    const now = new Date("2026-11-05T15:40:00-08:00"); // Nov 5, 3:40 PM in LA
    expect(bookStart(1, 9 * 60 + 30, now, LA)).toBe("2026-11-06T17:30:00.000Z"); // Nov 6, 9:30 AM PST
  });
  it("rolls over the month end", () => {
    expect(bookStart(3, 8 * 60, new Date("2026-11-29T12:00:00-08:00"), LA)).toBe("2026-12-02T16:00:00.000Z");
  });
  it("late evening in LA is already tomorrow in UTC (and in New York): «tomorrow» is still the company's", () => {
    const now = new Date("2026-11-05T22:30:00-08:00"); // 06:30Z on Nov 6
    expect(bookStart(1, 10 * 60, now, LA)).toBe("2026-11-06T18:00:00.000Z"); // Nov 6, 10:00 AM in LA — not Nov 7
  });
  it("a reminder in N days comes due at h:00 of the company", () => {
    expect(dayAtHour(0, 17, new Date("2026-11-05T22:30:00-08:00"), LA)).toBe("2026-11-06T01:00:00.000Z"); // Nov 5, 5 PM
  });
});

describe("snooze until", () => {
  it("N months later at 9:00, so the lead comes back at the start of a work day", () => {
    expect(snoozeUntil(3, new Date("2026-11-05T18:00:00-08:00"), LA)).toBe("2027-02-05T17:00:00.000Z");
  });
  it("Jan 31 + 1 month = the last day of February, not March 3", () => {
    expect(snoozeUntil(1, new Date("2027-01-31T10:00:00-08:00"), LA)).toBe("2027-02-28T17:00:00.000Z");
  });
  it("across the spring clock change 9:00 stays 9:00 (PDT)", () => {
    expect(snoozeUntil(6, new Date("2026-11-05T10:00:00-08:00"), LA)).toBe("2027-05-05T16:00:00.000Z");
  });
});
