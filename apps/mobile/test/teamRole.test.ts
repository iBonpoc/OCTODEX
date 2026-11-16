/**
 * unit:teamRole (#1866) — the role of a person already on the team: the same rules as public.set_member_role (T301).
 * A director changes an employee's role; never their own, never the owner's or a subcontractor's; an admin («Директор»
 * without the owner mark) is changed by the owner only; an admin may raise to admin (as an invitation can).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/cloud/client", () => ({ supabase: {} }));

import { canChangeRole, roleChoices, roleLabelKey, soleAdmin, teamErrorKey, teamRoleOf, TEAM_ROLES } from "../src/features/team";
import { appRoles } from "../src/cloud/repo";
import type { DB, Member } from "../src/data/types";

const p = (id: string, roles: Member["roles"], o: Partial<Member> = {}): Member => ({ id, name: id, initials: "··", kind: "employee", roles, ...o });
const owner = p("own", ["director", "dispatcher", "tech"], { isOwner: true });
const admin = p("adm", ["director", "dispatcher", "tech"]);
const admin2 = p("adm2", ["director", "dispatcher", "tech"]);
const office = p("off", ["dispatcher"]);
const sales = p("sal", ["sales"]);
const tech = p("tec", ["tech"]);
const sub = p("sub", ["tech"], { kind: "sub" });
const gone = p("gone", ["tech"], { pending: true, disabled: true });
const db = (me: string, members = [owner, admin, admin2, office, sales, tech, sub, gone]) => ({ me, members }) as unknown as DB;

describe("unit:teamRole — what the role is, as the server has it", () => {
  it("director without the owner mark is an admin; the owner, a subcontractor, someone not working — not changed here", () => {
    expect([admin, office, sales, tech].map(teamRoleOf)).toEqual(["admin", "office", "sales", "tech"]);
    expect([owner, sub, gone].map(teamRoleOf)).toEqual([null, null, null]);
  });
  it("each role's app roles are the ones a reload brings (appRoles), and its words", () => {
    for (const r of TEAM_ROLES) expect(teamRoleOf(p("x", appRoles(r)))).toBe(r);
    expect(TEAM_ROLES.map(roleLabelKey)).toEqual(["role.tech", "role.sales", "role.dispatcher", "role.director"]);
  });
});

describe("unit:teamRole — who changes whose role", () => {
  it("the owner: every employee, admins too; never themself", () => {
    const d = db("own");
    expect([admin, office, sales, tech].every((m) => canChangeRole(d, "own", m))).toBe(true);
    expect(canChangeRole(d, "own", owner)).toBe(false);
  });
  it("an admin: employees, not another admin, not the owner, not themself", () => {
    const d = db("adm");
    expect([office, sales, tech].every((m) => canChangeRole(d, "adm", m))).toBe(true);
    expect([admin2, owner, admin].some((m) => canChangeRole(d, "adm", m))).toBe(false);
  });
  it("a subcontractor or someone not working: nobody here (a new invitation)", () => {
    expect(canChangeRole(db("own"), "own", sub)).toBe(false);
    expect(canChangeRole(db("own"), "own", gone)).toBe(false);
  });
  it("office, sales, tech: no one's role", () => {
    for (const me of ["off", "sal", "tec"]) {
      expect([office, sales, tech, admin].some((m) => canChangeRole(db(me), me, m))).toBe(false);
      expect(roleChoices(db(me), me)).toEqual([]);
    }
  });
  it("a director gives the four roles (raising to admin too — the server asks for a fresh sign-in)", () => {
    expect(roleChoices(db("own"), "own")).toEqual(["tech", "sales", "office", "admin"]);
    expect(roleChoices(db("adm"), "adm")).toEqual(["tech", "sales", "office", "admin"]);
  });
  it("the only admin: lowering them leaves no one to hand the company over to", () => {
    expect(soleAdmin(db("own"), "adm")).toBe(false);
    expect(soleAdmin(db("own", [owner, admin, tech]), "adm")).toBe(true);
  });
});

describe("unit:teamRole — the server's «no» in the app's words", () => {
  it("each answer of set_member_role has its key", () => {
    expect(teamErrorKey("sign in again first")).toBe("team.err.signInAgain");
    expect(teamErrorKey("try again")).toBe("team.err.again");
    expect(teamErrorKey("no such person on the team")).toBe("team.err.gone");
    expect(teamErrorKey("only the owner changes an admin")).toBe("team.err.rights");
    expect(teamErrorKey("not yourself")).toBe("team.err.rights");
    expect(teamErrorKey("the company keeps a director")).toBe("team.err.lastOwner");
  });
});
