/**
 * companies.timezone (docs/specs/22 §1, «Каркас» №7). The server now refuses an unknown zone (22023 — a permanent error:
 * the queue would drop the whole company.save). So company.save sends the zone only when it was changed and this phone
 * knows it; «Расписание» offers the stored zone when it is not one of the 7 US chips (before: no chip was chosen).
 */
import { describe, expect, it } from "vitest";
import { companyFromDb, companyToDb, zoneToSend } from "../src/cloud/companyMap";
import { US_TIMEZONES, zoneChoices } from "../src/features/companySetup";
import { validZone } from "../src/features/zone";

const row = { id: "c1", name: "Co", timezone: "America/Denver" };

describe("company time zone (spec 22 §1)", () => {
  it("company.save does not send the stored zone again", () => {
    const out = companyToDb(companyFromDb(row, undefined, [], []), row) as Record<string, unknown>;
    expect("timezone" in out).toBe(false);
  });
  it("a changed zone is sent", () => {
    const c = { ...companyFromDb(row, undefined, [], []), timezone: "America/Chicago" };
    expect(companyToDb(c, row).timezone).toBe("America/Chicago");
  });
  it("a zone the phone does not know is never sent (the rest of the save still goes)", () => {
    const c = { ...companyFromDb(row, undefined, [], []), timezone: "Bad/Zone", name: "New name" };
    const out = companyToDb(c, row) as Record<string, unknown>;
    expect("timezone" in out).toBe(false);
    expect(out.name).toBe("New name");
    expect(zoneToSend("", "America/Denver")).toBe(false);
    expect(zoneToSend("America/Denver", undefined)).toBe(true);
  });
  it("«Расписание» offers the stored zone that is not a US chip", () => {
    expect(zoneChoices("America/Puerto_Rico", validZone)).toEqual([...US_TIMEZONES, "America/Puerto_Rico"]);
    expect(zoneChoices("America/Chicago", validZone)).toEqual(US_TIMEZONES);
    expect(zoneChoices("Bad/Zone", validZone)).toEqual(US_TIMEZONES);
    expect(zoneChoices(undefined, validZone)).toEqual(US_TIMEZONES);
  });
  it("the «zone chosen» flag (spec 22 §1.3): a save without it never sends the zone, even one the server lacks", () => {
    const c = { ...companyFromDb(row, undefined, [], []), timezone: "America/Chicago" };
    // a long-offline phone saves the name: its old zone must not overwrite another admin's new one
    expect("timezone" in (companyToDb(c, { ...row, timezone: "America/New_York" }, false) as Record<string, unknown>)).toBe(false);
    // chosen on «Расписание»: sent (even when the server already has it)
    expect(companyToDb(c, { ...row, timezone: "America/New_York" }, true).timezone).toBe("America/Chicago");
    expect(companyToDb(c, { ...row, timezone: "America/Chicago" }, true).timezone).toBe("America/Chicago");
    // chosen, but this phone does not know it: never sent
    expect(zoneToSend("Bad/Zone", "America/Denver", true)).toBe(false);
    // an op of an older build (no flag): as before — when it differs from the server
    expect(zoneToSend("America/Chicago", "America/New_York", undefined)).toBe(true);
    expect(zoneToSend("America/Chicago", "America/Chicago", undefined)).toBe(false);
  });
});
