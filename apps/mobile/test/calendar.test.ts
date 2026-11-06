import { describe, it, expect } from "vitest";
import { addDays, addMonths, fromDayKey, monthGrid, weekDays, weekStart } from "../src/features/calendar";

describe("calendar math for the Plan", () => {
  it("week starts on Monday, including Sunday dates", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // Wed → Mon
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sun → previous Mon
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekDays("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("days cross months, years and the DST change (Nov 1 2026, US)", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29"); // leap year
  });
  it("months keep the day or clamp to the month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-04", -1)).toBe("2026-10-04");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("month grid: 42 cells from the Monday before the 1st, all days of the month inside", () => {
    const g = monthGrid("2026-11-17");
    expect(g).toHaveLength(42);
    expect(g[0]!.key).toBe("2026-10-26");
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
    expect(g.find((c) => c.inMonth)!.key).toBe("2026-11-01");
  });
  it("day key round-trip", () => {
    // noon UTC of the day: the label formatted in UTC is that day on any machine zone
    expect(fromDayKey("2026-11-04").toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(fromDayKey("2026-11-08"))).toBe("Sun, Nov 8");
  });
});
