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
});
