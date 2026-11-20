/** company.save merges jsonb settings with what is stored (cloud/companyMap.ts). П4a review: the read before the save
 *  missed schedule_settings / business_hours / lead_settings, so a save from any profile section wiped them. */
import { describe, expect, it } from "vitest";
import { assigneeToSend, COMPANY_STORED_COLUMNS, companyFromDb, companyToDb } from "../src/cloud/companyMap";

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
  it("whom new leads go to: read; never in the settings row (Р-7: by its own request, assigneeToSend)", () => {
    const c = companyFromDb({ id: "c1", name: "Co", lead_default_assignee_id: "u-office" }, undefined, [], []);
    expect(c.leadDefaultAssigneeId).toBe("u-office");
    expect("lead_default_assignee_id" in companyToDb(c, row)).toBe(false);
    const none = companyFromDb({ id: "c1", name: "Co" }, undefined, [], []);
    expect(none.leadDefaultAssigneeId).toBeNull();
  });
  it("assigneeToSend: chosen in this save — sent (null = the owner); not chosen — not sent, even if the stored one differs", () => {
    expect(assigneeToSend("u-x", "u-y", true)).toBe(true);
    expect(assigneeToSend(null, "u-y", true)).toBe(true);
    expect(assigneeToSend("u-x", "u-y", false)).toBe(false);
    // an older op without the flag: only when it differs from the stored one
    expect(assigneeToSend("u-x", "u-x", undefined)).toBe(false);
    expect(assigneeToSend("u-x", "u-y", undefined)).toBe(true);
    expect(assigneeToSend(null, null, undefined)).toBe(false);
    // an old cache without the field: never
    expect(assigneeToSend(undefined, "u-y", true)).toBe(false);
  });
});
