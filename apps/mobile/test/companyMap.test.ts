/** company.save merges jsonb settings with what is stored (cloud/companyMap.ts). П4a review: the read before the save
 *  missed schedule_settings / business_hours / lead_settings, so a save from any profile section wiped them. */
import { describe, expect, it } from "vitest";
import { COMPANY_STORED_COLUMNS, companyFromDb, companyToDb } from "../src/cloud/companyMap";

const row = {
  id: "c1", name: "Co", timezone: "America/Denver",
  lead_settings: { replyWarnMin: 10 },
  schedule_settings: { lateAfterMin: 30, inspectionMin: 60 },
  business_hours: { mon: [420, 960], sun: null },
};

describe("company ↔ database rows (П4a)", () => {
  it("every jsonb column companyToDb merges is read before the save", () => {
    const stored = Object.fromEntries(COMPANY_STORED_COLUMNS.map((k) => [k, {}]));
    const out = companyToDb(companyFromDb(row, undefined, [], []), stored) as Record<string, unknown>;
    const merged = Object.keys(out).filter((k) => out[k] !== null && typeof out[k] === "object" && !Array.isArray(out[k]));
    for (const k of merged) expect(COMPANY_STORED_COLUMNS as readonly string[], `read ${k} before company.save`).toContain(k);
  });
  it("schedule settings and hours go to the database and back", () => {
    const c = companyFromDb(row, undefined, [], []);
    expect(c.scheduleSettings).toEqual({ lateAfterMin: 30, inspectionMin: 60 });
    expect(c.businessHours).toEqual({ mon: [420, 960], sun: null });
    const out = companyToDb(c, row);
    expect(out.schedule_settings).toEqual({ lateAfterMin: 30, inspectionMin: 60 });
    expect(out.business_hours).toEqual({ mon: [420, 960], sun: null });
    // the zone is not sent when it is the stored one (docs/specs/22 §1)
    expect(out.timezone).toBeUndefined();
  });
  it("a phone copy without the schedule keeps what is stored (no wipe to null / {})", () => {
    const c = { ...companyFromDb({ id: "c1", name: "Co" }, undefined, [], []), scheduleSettings: undefined, businessHours: undefined };
    const out = companyToDb(c, row);
    expect(out.schedule_settings).toEqual({ lateAfterMin: 30, inspectionMin: 60 });
    expect(out.business_hours).toEqual({ mon: [420, 960], sun: null });
    expect(out.lead_settings).toEqual({ replyWarnMin: 10 });
  });
});
