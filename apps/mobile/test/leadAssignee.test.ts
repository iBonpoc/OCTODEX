/** Whom a new lead goes to (docs/14-leads-spec.md §6.4, companies.lead_default_assignee_id): the choice while at work, else the owner. */
import { describe, expect, it } from "vitest";
import type { Member } from "../src/data/types";
import { companyOwner, defaultLeadAssignee, leadAssigneeChoices } from "../src/features/leadAssignee";

const m = (id: string, p: Partial<Member> = {}): Member => ({ id, name: id, initials: id.slice(0, 2), kind: "employee", roles: ["tech"], ...p });
// in the cloud owner and admin are both «director»; the admin comes first on the list
const admin = m("admin", { roles: ["director", "dispatcher", "tech"] });
const owner = m("owner", { roles: ["director", "dispatcher", "tech"], isOwner: true });
const office = m("office", { roles: ["dispatcher"] });
const tech = m("tech");
const sub = m("sub", { kind: "sub" });
const off = m("off", { pending: true, disabled: true });
const gone = m("gone", { pending: true, deleted: true });
const invited = m("inv-1", { pending: true });
const team = [admin, owner, office, tech, sub, off, gone, invited];

describe("default lead assignee", () => {
  it("nothing chosen → the owner, not the admin listed first (isOwner)", () => {
    expect(defaultLeadAssignee({}, team, "me")).toBe("owner");
    expect(defaultLeadAssignee(null, team, "me")).toBe("owner");
  });
  it("the chosen person at work gets the lead", () => {
    expect(defaultLeadAssignee({ leadDefaultAssigneeId: "office" }, team, "me")).toBe("office");
    expect(defaultLeadAssignee({ leadDefaultAssigneeId: "tech" }, team, "me")).toBe("tech");
    expect(defaultLeadAssignee({ leadDefaultAssigneeId: "admin" }, team, "me")).toBe("admin");
  });
  it("switched off, deleted, invited, left (not in members) or a subcontractor → the owner", () => {
    for (const id of ["off", "gone", "inv-1", "left", "sub"]) expect(defaultLeadAssignee({ leadDefaultAssigneeId: id }, team, "me")).toBe("owner");
  });
  it("no owner flag (demo, old data) → the first director; nobody → me", () => {
    expect(companyOwner([office, admin], "me")).toBe("admin");
    expect(companyOwner([office, tech], "me")).toBe("me");
    expect(companyOwner([{ ...owner, pending: true }, admin], "me")).toBe("admin");
  });
  it("the picker lists employees at work only", () => {
    expect(leadAssigneeChoices(team).map((x) => x.id)).toEqual(["admin", "owner", "office", "tech"]);
  });
});
